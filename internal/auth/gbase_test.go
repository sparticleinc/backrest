package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newGBaseTestServer(t *testing.T, authorityCodes []string, hits *int) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/user/my/company/default", func(w http.ResponseWriter, r *http.Request) {
		*hits++
		if r.Header.Get("Authorization") != "Bearer good-token" {
			http.Error(w, `{"success":false}`, http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"success":true,"company":{"id":"12345"}}`)
	})
	mux.HandleFunc("/user/company/12345/my/authority/", func(w http.ResponseWriter, r *http.Request) {
		codes := "["
		for i, c := range authorityCodes {
			if i > 0 {
				codes += ","
			}
			codes += `"` + c + `"`
		}
		codes += "]"
		fmt.Fprint(w, `{"success":true,"authorityCodes":`+codes+`}`)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGBaseVerifyTokenWithAuthority(t *testing.T) {
	hits := 0
	server := newGBaseTestServer(t, []string{"BOT_VIEW", "COMPANY_MANAGER"}, &hits)
	g := NewGBaseAuthenticator(server.URL)

	user, err := g.VerifyToken(context.Background(), "good-token")
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if user.Name == "" {
		t.Errorf("expected a user name to be set")
	}
}

func TestGBaseVerifyTokenWithoutAuthority(t *testing.T) {
	hits := 0
	server := newGBaseTestServer(t, []string{"BOT_VIEW", "DATASET_VIEW"}, &hits)
	g := NewGBaseAuthenticator(server.URL)

	_, err := g.VerifyToken(context.Background(), "good-token")
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got: %v", err)
	}
}

func TestGBaseVerifyTokenRejectsBadToken(t *testing.T) {
	hits := 0
	server := newGBaseTestServer(t, []string{"COMPANY_OWNER"}, &hits)
	g := NewGBaseAuthenticator(server.URL)

	_, err := g.VerifyToken(context.Background(), "bad-token")
	if err == nil {
		t.Fatal("expected an error for a bad token")
	}
	if errors.Is(err, ErrNoPermission) {
		t.Fatalf("bad token should not map to ErrNoPermission, got: %v", err)
	}
}

func TestGBaseTokenFromCookie(t *testing.T) {
	cases := []struct {
		name   string
		cookie string
		want   string
	}{
		{"bare token", "abc.def.ghi", "abc.def.ghi"},
		{"bearer prefix", "Bearer abc.def.ghi", "abc.def.ghi"},
		{"url encoded bearer", "Bearer%20abc.def.ghi", "abc.def.ghi"},
		{"quoted", `"abc.def.ghi"`, "abc.def.ghi"},
		{"empty", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.cookie != "" {
				r.AddCookie(&http.Cookie{Name: GBaseTokenCookie, Value: tc.cookie})
			}
			if got := gbaseTokenFromCookie(r); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGBaseVerifyTokenCachesResults(t *testing.T) {
	hits := 0
	server := newGBaseTestServer(t, []string{"COMPANY_OWNER"}, &hits)
	g := NewGBaseAuthenticator(server.URL)

	for i := 0; i < 3; i++ {
		if _, err := g.VerifyToken(context.Background(), "good-token"); err != nil {
			t.Fatalf("expected success, got: %v", err)
		}
	}
	if hits != 1 {
		t.Errorf("expected 1 upstream hit due to caching, got %d", hits)
	}
}
