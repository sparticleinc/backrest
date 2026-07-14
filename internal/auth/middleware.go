package auth

import (
	"context"
	"errors"
	"net/http"

	"go.uber.org/zap"
)

type contextKey string

func (k contextKey) String() string {
	return "auth context value " + string(k)
}

const UserContextKey contextKey = "user"

func RequireAuthentication(h http.Handler, auth *Authenticator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// GBase auth not configured (e.g. local dev build): no authentication.
		if auth.gbase == nil {
			h.ServeHTTP(w, r)
			return
		}

		// Pass OPTIONS through unauthenticated so CORS preflight succeeds.
		if r.Method == http.MethodOptions {
			h.ServeHTTP(w, r)
			return
		}
		// The browser sends the GBase cookie automatically; fall back to
		// the Authorization header for non-browser clients.
		token := gbaseTokenFromCookie(r)
		if token == "" {
			token, _ = ParseBearerToken(r.Header.Get("Authorization"))
		}
		if token == "" {
			http.Error(w, "Unauthorized (No Token)", http.StatusUnauthorized)
			return
		}
		user, err := auth.gbase.VerifyToken(r.Context(), token)
		if errors.Is(err, ErrNoPermission) {
			http.Error(w, "Forbidden: "+ErrNoPermission.Error(), http.StatusForbidden)
			return
		} else if err != nil {
			zap.S().Warnf("gbase auth blocked bad token: %v", err)
			http.Error(w, "Unauthorized (Bad Token)", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), UserContextKey, user)
		h.ServeHTTP(w, r.WithContext(ctx))
	})
}
