package auth

// Authenticator authenticates requests against the GBase Onprem user service.
// When no GBase authenticator is configured (e.g. local dev builds) requests
// are not authenticated at all.
type Authenticator struct {
	gbase *GBaseAuthenticator
}

// UseGBase delegates all request authentication to the GBase Onprem user
// service.
func (a *Authenticator) UseGBase(g *GBaseAuthenticator) {
	a.gbase = g
}

func NewAuthenticator() *Authenticator {
	return &Authenticator{}
}
