package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GitHubService handles GitHub OAuth Device Flow and team-based permissions.
type GitHubService struct {
	clientID string
	org      string
	authDir  string // Application Support dir for github_auth.json; not workspace root

	// Device flow state (transient, not persisted)
	deviceCode string
	interval   int
	expiresAt  time.Time

	// Auth state
	accessToken string
	username    string
	avatarURL   string
	teams       []string
}

// DeviceFlowResponse is returned when initiating the GitHub OAuth Device Flow.
type DeviceFlowResponse struct {
	UserCode        string `json:"userCode"`
	VerificationURI string `json:"verificationUri"`
	ExpiresIn       int    `json:"expiresIn"`
}

// Permissions represents the computed access for the authenticated user.
type Permissions struct {
	Connected bool     `json:"connected"`
	Username  string   `json:"username"`
	AvatarURL string   `json:"avatarUrl"`
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
	AvatarURL   string   `json:"avatarUrl"`
	Teams       []string `json:"teams"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Team-to-permission mapping
// ──────────────────────────────────────────────────────────────────────────────

var baseViews = []string{"home", "projects", "activity", "settings"}
var baseCommands = []string{"Navigation", "General", "Projects", "Environment"}

var everyView = []string{"home", "projects", "infrastructure", "backend", "mesh", "plugins", "activity", "settings"}
var everyCommand = []string{"Navigation", "General", "Projects", "Infrastructure", "Backend", "Migrations", "Protobuf", "Environment"}

var teamExtraViews = map[string][]string{
	"core-devs":   {"infrastructure", "backend", "mesh"},
	"plugin-devs": {"plugins"},
}

var teamExtraCommands = map[string][]string{
	"core-devs": {"Infrastructure", "Backend", "Migrations", "Protobuf"},
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewGitHubService creates a new service and loads any persisted auth token.
// authDir should be the Application Support path (cfg.AppDataDir), not the workspace root.
func NewGitHubService(clientID, org, authDir string) *GitHubService {
	svc := &GitHubService{
		clientID: clientID,
		org:      org,
		authDir:  authDir,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.authDir, "github_auth.json")
}

func (s *GitHubService) loadToken() {
	data, err := os.ReadFile(s.authFilePath())
	if err != nil {
		return
	}
	var stored storedAuth
	if err := json.Unmarshal(data, &stored); err != nil {
		return
	}
	s.accessToken = stored.AccessToken
	s.username = stored.Username
	s.avatarURL = stored.AvatarURL
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
		AvatarURL:   s.avatarURL,
		Teams:       s.teams,
	}
	data, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.authFilePath(), data, 0600)
}

func (s *GitHubService) clearToken() error {
	s.accessToken = ""
	s.username = ""
	s.avatarURL = ""
	s.teams = nil
	_ = os.Remove(s.authFilePath())
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Device Flow
// ──────────────────────────────────────────────────────────────────────────────

// StartDeviceFlow initiates the GitHub OAuth Device Flow and returns
// the user code and verification URI to display in the frontend.
func (s *GitHubService) StartDeviceFlow() (*DeviceFlowResponse, error) {
	if s.clientID == "" {
		return nil, fmt.Errorf("GitHub Client ID not configured. Set WABISABY_GITHUB_CLIENT_ID")
	}

	form := url.Values{}
	form.Set("client_id", s.clientID)
	form.Set("scope", "read:org")

	req, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact GitHub: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
		Error           string `json:"error"`
		ErrorDesc       string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid response from GitHub: %w", err)
	}
	if result.Error != "" {
		return nil, fmt.Errorf("GitHub error: %s — %s", result.Error, result.ErrorDesc)
	}

	s.deviceCode = result.DeviceCode
	s.interval = result.Interval
	if s.interval < 5 {
		s.interval = 5
	}
	s.expiresAt = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)

	return &DeviceFlowResponse{
		UserCode:        result.UserCode,
		VerificationURI: result.VerificationURI,
		ExpiresIn:       result.ExpiresIn,
	}, nil
}

// PollForToken polls GitHub until the user completes authorisation.
// It blocks until success, expiry, or denial.
func (s *GitHubService) PollForToken() (*Permissions, error) {
	if s.deviceCode == "" {
		return nil, fmt.Errorf("no pending device flow; call StartDeviceFlow first")
	}

	for {
		if time.Now().After(s.expiresAt) {
			s.deviceCode = ""
			return nil, fmt.Errorf("device code expired; please try again")
		}

		time.Sleep(time.Duration(s.interval) * time.Second)

		form := url.Values{}
		form.Set("client_id", s.clientID)
		form.Set("device_code", s.deviceCode)
		form.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")

		req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			continue // retry on transient network error
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var result struct {
			AccessToken string `json:"access_token"`
			TokenType   string `json:"token_type"`
			Scope       string `json:"scope"`
			Error       string `json:"error"`
			ErrorDesc   string `json:"error_description"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			continue
		}

		switch result.Error {
		case "authorization_pending":
			continue
		case "slow_down":
			s.interval += 5
			continue
		case "expired_token":
			s.deviceCode = ""
			return nil, fmt.Errorf("device code expired; please try again")
		case "access_denied":
			s.deviceCode = ""
			return nil, fmt.Errorf("authorisation denied by user")
		case "":
			// Success — save the token and fetch user info + teams.
			s.accessToken = result.AccessToken
			s.deviceCode = ""

			username, avatarURL, err := s.fetchUser()
			if err != nil {
				return nil, fmt.Errorf("failed to get GitHub user: %w", err)
			}
			s.username = username
			s.avatarURL = avatarURL

			teams, err := s.fetchTeams()
			if err != nil {
				return nil, fmt.Errorf("failed to fetch teams: %w", err)
			}
			s.teams = teams

			_ = s.saveToken()
			return s.computePermissions(), nil
		default:
			s.deviceCode = ""
			return nil, fmt.Errorf("GitHub error: %s — %s", result.Error, result.ErrorDesc)
		}
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Public query methods
// ──────────────────────────────────────────────────────────────────────────────

// GetStatus returns the current auth status and cached permissions.
// If a token is stored it verifies it is still valid.
func (s *GitHubService) GetStatus() *Permissions {
	if s.accessToken == "" {
		return &Permissions{Connected: false}
	}

	// Quick validation: hit /user to check the token is alive.
	username, avatarURL, err := s.fetchUser()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username
	s.avatarURL = avatarURL
	_ = s.saveToken()

	return s.computePermissions()
}

// Disconnect clears the stored token and returns disconnected state.
func (s *GitHubService) Disconnect() *Permissions {
	s.clearToken()
	return &Permissions{Connected: false}
}

// RefreshTeams re-fetches team memberships from GitHub and recomputes permissions.
func (s *GitHubService) RefreshTeams() (*Permissions, error) {
	if s.accessToken == "" {
		return &Permissions{Connected: false}, nil
	}

	teams, err := s.fetchTeams()
	if err != nil {
		return nil, fmt.Errorf("failed to refresh teams: %w", err)
	}
	s.teams = teams
	_ = s.saveToken()

	return s.computePermissions(), nil
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub API helpers
// ──────────────────────────────────────────────────────────────────────────────

// fetchUser returns the authenticated user's login and avatar URL.
func (s *GitHubService) fetchUser() (login, avatarURL string, err error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", "", err
	}
	return user.Login, user.AvatarURL, nil
}

func (s *GitHubService) fetchTeams() ([]string, error) {
	var orgTeams []string
	page := 1

	for {
		u := fmt.Sprintf("https://api.github.com/user/teams?per_page=100&page=%d", page)
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+s.accessToken)
		req.Header.Set("Accept", "application/vnd.github+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
		}

		var teams []struct {
			Slug string `json:"slug"`
			Org  struct {
				Login string `json:"login"`
			} `json:"organization"`
		}
		if err := json.Unmarshal(body, &teams); err != nil {
			return nil, err
		}

		if len(teams) == 0 {
			break
		}
		for _, t := range teams {
			if strings.EqualFold(t.Org.Login, s.org) {
				orgTeams = append(orgTeams, t.Slug)
			}
		}
		if len(teams) < 100 {
			break
		}
		page++
	}

	return orgTeams, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Permission computation
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) computePermissions() *Permissions {
	// Maintainers get full access.
	for _, t := range s.teams {
		if t == "maintainers" {
			return &Permissions{
				Connected: true,
				Username:  s.username,
				AvatarURL: s.avatarURL,
				Teams:     s.teams,
				Views:     everyView,
				Commands:  everyCommand,
			}
		}
	}

	// Additive: start with base, add extras per team.
	viewSet := make(map[string]bool, len(baseViews))
	cmdSet := make(map[string]bool, len(baseCommands))

	for _, v := range baseViews {
		viewSet[v] = true
	}
	for _, c := range baseCommands {
		cmdSet[c] = true
	}

	for _, team := range s.teams {
		for _, v := range teamExtraViews[team] {
			viewSet[v] = true
		}
		for _, c := range teamExtraCommands[team] {
			cmdSet[c] = true
		}
	}

	views := make([]string, 0, len(viewSet))
	for v := range viewSet {
		views = append(views, v)
	}
	commands := make([]string, 0, len(cmdSet))
	for c := range cmdSet {
		commands = append(commands, c)
	}

	return &Permissions{
		Connected: true,
		Username:  s.username,
		AvatarURL: s.avatarURL,
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
}
