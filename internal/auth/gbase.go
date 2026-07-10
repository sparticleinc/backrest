package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	v1 "github.com/garethgeorge/backrest/gen/go/v1"
)

// ErrNoPermission indicates the token is valid but the user lacks the required authority codes.
var ErrNoPermission = errors.New("missing COMPANY_OWNER or COMPANY_MANAGER authority")

var gbaseRequiredAuthorities = []string{"COMPANY_OWNER", "COMPANY_MANAGER"}

const (
	gbaseCacheOKTTL   = 24 * time.Hour
	gbaseCacheFailTTL = time.Hour
)

// GBaseAuthenticator validates bearer tokens against the GBase Onprem user service.
type GBaseAuthenticator struct {
	baseURL string
	client  *http.Client

	mu    sync.Mutex
	cache map[string]gbaseCacheEntry
}

type gbaseCacheEntry struct {
	user      *v1.User
	err       error
	expiresAt time.Time
}

func NewGBaseAuthenticator(baseURL string) *GBaseAuthenticator {
	return &GBaseAuthenticator{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		client:  &http.Client{Timeout: 10 * time.Second},
		cache:   make(map[string]gbaseCacheEntry),
	}
}

// VerifyToken checks the token against GBase Onprem and requires one of
// gbaseRequiredAuthorities. Results are cached briefly so that bursts of API
// calls don't hammer the upstream service.
func (g *GBaseAuthenticator) VerifyToken(ctx context.Context, token string) (*v1.User, error) {
	sum := sha256.Sum256([]byte(token))
	key := hex.EncodeToString(sum[:])
	now := time.Now()

	g.mu.Lock()
	if entry, ok := g.cache[key]; ok && now.Before(entry.expiresAt) {
		g.mu.Unlock()
		return entry.user, entry.err
	}
	g.mu.Unlock()

	user, err := g.verifyRemote(ctx, token)

	ttl := gbaseCacheOKTTL
	if err != nil {
		ttl = gbaseCacheFailTTL
	}
	g.mu.Lock()
	for k, entry := range g.cache {
		if now.After(entry.expiresAt) {
			delete(g.cache, k)
		}
	}
	g.cache[key] = gbaseCacheEntry{user: user, err: err, expiresAt: now.Add(ttl)}
	g.mu.Unlock()

	return user, err
}

func (g *GBaseAuthenticator) verifyRemote(ctx context.Context, token string) (*v1.User, error) {
	var companyResp struct {
		Success bool `json:"success"`
		Company struct {
			ID string `json:"id"`
		} `json:"company"`
	}
	if err := g.getJSON(ctx, token, "/user/my/company/default", &companyResp); err != nil {
		return nil, fmt.Errorf("fetch default company: %w", err)
	}
	if !companyResp.Success || companyResp.Company.ID == "" {
		return nil, errors.New("token rejected by gbase user service")
	}

	var authorityResp struct {
		Success        bool     `json:"success"`
		AuthorityCodes []string `json:"authorityCodes"`
	}
	if err := g.getJSON(ctx, token, "/user/company/"+companyResp.Company.ID+"/my/authority/", &authorityResp); err != nil {
		return nil, fmt.Errorf("fetch authority codes: %w", err)
	}
	if !authorityResp.Success {
		return nil, errors.New("authority lookup rejected by gbase user service")
	}

	hasAuthority := slices.ContainsFunc(gbaseRequiredAuthorities, func(required string) bool {
		return slices.Contains(authorityResp.AuthorityCodes, required)
	})
	if !hasAuthority {
		return nil, ErrNoPermission
	}

	return &v1.User{Name: gbaseTokenSubject(token)}, nil
}

func (g *GBaseAuthenticator) getJSON(ctx context.Context, token, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gbase user service returned status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// gbaseTokenSubject extracts a display name from the JWT payload without
// verifying it; the token has already been validated by the gbase service.
func gbaseTokenSubject(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "gbase-user"
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "gbase-user"
	}
	var claims struct {
		Email string `json:"https://github.com/dorinclisu/fastapi-auth0/email"`
		Sub   string `json:"sub"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "gbase-user"
	}
	if claims.Email != "" {
		return claims.Email
	}
	if claims.Sub != "" {
		return claims.Sub
	}
	return "gbase-user"
}
