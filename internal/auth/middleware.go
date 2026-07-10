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
const APIKeyContextKey contextKey = "api_key"

func RequireAuthentication(h http.Handler, auth *Authenticator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// When GBase auth is enabled it takes over all authentication,
		// regardless of the local auth config.
		if auth.gbase != nil {
			// Pass OPTIONS through unauthenticated so CORS preflight succeeds.
			if r.Method == http.MethodOptions {
				h.ServeHTTP(w, r)
				return
			}
			token, err := ParseBearerToken(r.Header.Get("Authorization"))
			if err != nil {
				http.Error(w, "Unauthorized (No Authorization Header)", http.StatusUnauthorized)
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
			return
		}

		config, err := auth.config.Get()
		if err != nil {
			zap.S().Errorf("auth middleware failed to get config: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		if config.GetAuth() == nil || config.GetAuth().GetDisabled() {
			h.ServeHTTP(w, r)
			return
		}

		// Pass OPTIONS through unauthenticated so CORS preflight succeeds.
		if r.Method == http.MethodOptions {
			h.ServeHTTP(w, r)
			return
		}

		username, password, usesBasicAuth := r.BasicAuth()
		if usesBasicAuth {
			user, err := auth.Login(username, password)
			if err == nil {
				ctx := context.WithValue(r.Context(), UserContextKey, user)
				h.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// TODO: process the API Key

		token, err := ParseBearerToken(r.Header.Get("Authorization"))
		if err != nil {
			http.Error(w, "Unauthorized (No Authorization Header)", http.StatusUnauthorized)
			return
		}

		user, err := auth.VerifyJWT(token)
		if err != nil {
			zap.S().Warnf("auth middleware blocked bad JWT: %v", err)
			http.Error(w, "Unauthorized (Bad Token)", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		h.ServeHTTP(w, r.WithContext(ctx))
	})
}
