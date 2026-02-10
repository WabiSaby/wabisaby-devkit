//go:build ignore
// +build ignore

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
	clientID   string
	org        string
	devkitRoot string

	// Device flow state (transient, not persisted)
	deviceCode string
	interval   int
	expiresAt  time.Time

	// Auth state
	accessToken string
	username    string
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
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
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
func NewGitHubService(clientID, org, devkitRoot string) *GitHubService {
	svc := &GitHubService{
		clientID:   clientID,
		org:        org,
		devkitRoot: devkitRoot,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.devkitRoot, "github_auth.json")
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
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
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

			username, err := s.fetchUsername()
			if err != nil {
				return nil, fmt.Errorf("failed to get GitHub user: %w", err)
			}
			s.username = username

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
	username, err := s.fetchUsername()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username

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

func (s *GitHubService) fetchUsername() (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return user.Login, nil
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
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
}

/* package service

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
	clientID   string
	org        string
	devkitRoot string

	// Device flow state (transient, not persisted)
	deviceCode string
	interval   int
	expiresAt  time.Time

	// Auth state
	accessToken string
	username    string
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
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
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
	"core-devs":  {"infrastructure", "backend", "mesh"},
	"plugin-devs": {"plugins"},
}

var teamExtraCommands = map[string][]string{
	"core-devs": {"Infrastructure", "Backend", "Migrations", "Protobuf"},
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewGitHubService creates a new service and loads any persisted auth token.
func NewGitHubService(clientID, org, devkitRoot string) *GitHubService {
	svc := &GitHubService{
		clientID:   clientID,
		org:        org,
		devkitRoot: devkitRoot,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.devkitRoot, "github_auth.json")
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
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
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

			username, err := s.fetchUsername()
			if err != nil {
				return nil, fmt.Errorf("failed to get GitHub user: %w", err)
			}
			s.username = username

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
	username, err := s.fetchUsername()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username

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

func (s *GitHubService) fetchUsername() (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return user.Login, nil
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
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
}
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
	clientID   string
	org        string
	devkitRoot string

	// Device flow state (transient, not persisted)
	deviceCode string
	interval   int
	expiresAt  time.Time

	// Auth state
	accessToken string
	username    string
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
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
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
	"core-devs":  {"infrastructure", "backend", "mesh"},
	"plugin-devs": {"plugins"},
}

var teamExtraCommands = map[string][]string{
	"core-devs": {"Infrastructure", "Backend", "Migrations", "Protobuf"},
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewGitHubService creates a new service and loads any persisted auth token.
func NewGitHubService(clientID, org, devkitRoot string) *GitHubService {
	svc := &GitHubService{
		clientID:   clientID,
		org:        org,
		devkitRoot: devkitRoot,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.devkitRoot, "github_auth.json")
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
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
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

			username, err := s.fetchUsername()
			if err != nil {
				return nil, fmt.Errorf("failed to get GitHub user: %w", err)
			}
			s.username = username

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
	username, err := s.fetchUsername()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username

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

func (s *GitHubService) fetchUsername() (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return user.Login, nil
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
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
package service

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GitHubService handles GitHub App OAuth and team-based permissions.
type GitHubService struct {
	appID             string
	appClientID       string
	appClientSecret   string
	appPrivateKeyPath string
	callbackURL       string
	org               string
	devkitRoot        string

	oauthMu        sync.Mutex
	oauthState     string
	authResultCh   chan authResult
	callbackServer *http.Server

	// Auth state
	accessToken string
	username    string
	teams       []string
}

// OAuthStartResponse is returned when initiating the GitHub App OAuth flow.
type OAuthStartResponse struct {
	AuthorizationURL string `json:"authorizationUrl"`
}

// Permissions represents the computed access for the authenticated user.
type Permissions struct {
	Connected bool     `json:"connected"`
	Username  string   `json:"username"`
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
	Teams       []string `json:"teams"`
}

type authResult struct {
	perms *Permissions
	err   error
}

// ──────────────────────────────────────────────────────────────────────────────
// Team-to-permission mapping
// ──────────────────────────────────────────────────────────────────────────────

var baseViews = []string{"home", "projects", "activity", "settings"}
var baseCommands = []string{"Navigation", "General", "Projects", "Environment"}

var everyView = []string{"home", "projects", "infrastructure", "backend", "mesh", "plugins", "activity", "settings"}
var everyCommand = []string{"Navigation", "General", "Projects", "Infrastructure", "Backend", "Migrations", "Protobuf", "Environment"}

var teamExtraViews = map[string][]string{
	"core-devs":  {"infrastructure", "backend", "mesh"},
	"plugin-devs": {"plugins"},
}

var teamExtraCommands = map[string][]string{
	"core-devs": {"Infrastructure", "Backend", "Migrations", "Protobuf"},
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewGitHubService creates a new service and loads any persisted auth token.
func NewGitHubService(appID, appClientID, appClientSecret, appPrivateKeyPath, callbackURL, org, devkitRoot string) *GitHubService {
	svc := &GitHubService{
		appID:             appID,
		appClientID:       appClientID,
		appClientSecret:   appClientSecret,
		appPrivateKeyPath: appPrivateKeyPath,
		callbackURL:       callbackURL,
		org:               org,
		devkitRoot:        devkitRoot,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.devkitRoot, "github_auth.json")
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
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
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
	s.teams = nil
	_ = os.Remove(s.authFilePath())
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub App OAuth
// ──────────────────────────────────────────────────────────────────────────────

// StartOAuth begins the GitHub App OAuth flow and returns the auth URL.
func (s *GitHubService) StartOAuth() (*OAuthStartResponse, error) {
	if s.appClientID == "" || s.appClientSecret == "" || s.appID == "" || s.appPrivateKeyPath == "" {
		return nil, fmt.Errorf("GitHub App configuration missing. Set WABISABY_GITHUB_APP_ID, WABISABY_GITHUB_APP_CLIENT_ID, WABISABY_GITHUB_APP_CLIENT_SECRET, WABISABY_GITHUB_APP_PRIVATE_KEY_PATH")
	}
	if s.callbackURL == "" {
		return nil, fmt.Errorf("GitHub App callback URL missing. Set WABISABY_GITHUB_APP_CALLBACK_URL")
	}

	if err := s.ensureCallbackServer(); err != nil {
		return nil, err
	}

	state, err := randomState(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate state: %w", err)
	}

	s.oauthMu.Lock()
	s.oauthState = state
	s.authResultCh = make(chan authResult, 1)
	s.oauthMu.Unlock()

	q := url.Values{}
	q.Set("client_id", s.appClientID)
	q.Set("redirect_uri", s.callbackURL)
	q.Set("state", state)

	authURL := "https://github.com/login/oauth/authorize?" + q.Encode()
	return &OAuthStartResponse{AuthorizationURL: authURL}, nil
}

// WaitForAuth blocks until the OAuth callback completes.
func (s *GitHubService) WaitForAuth() (*Permissions, error) {
	s.oauthMu.Lock()
	ch := s.authResultCh
	s.oauthMu.Unlock()
	if ch == nil {
		return nil, fmt.Errorf("no OAuth flow in progress")
	}

	select {
	case result := <-ch:
		return result.perms, result.err
	case <-time.After(10 * time.Minute):
		return nil, fmt.Errorf("authorization timed out")
	}
}

func (s *GitHubService) ensureCallbackServer() error {
	if s.callbackServer != nil {
		return nil
	}
	parsed, err := url.Parse(s.callbackURL)
	if err != nil {
		return fmt.Errorf("invalid callback URL: %w", err)
	}
	host := parsed.Host
	if host == "" {
		return fmt.Errorf("callback URL must include host")
	}
	path := parsed.Path
	if path == "" {
		path = "/oauth/callback"
	}

	mux := http.NewServeMux()
	mux.HandleFunc(path, s.handleOAuthCallback)
	ln, err := net.Listen("tcp", host)
	if err != nil {
		return fmt.Errorf("failed to start callback server at %s: %w", host, err)
	}

	server := &http.Server{
		Handler: mux,
	}
	s.callbackServer = server

	go func() {
		_ = server.Serve(ln)
	}()

	return nil
}

func (s *GitHubService) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if errParam := query.Get("error"); errParam != "" {
		desc := query.Get("error_description")
		s.finishOAuth(nil, fmt.Errorf("GitHub error: %s — %s", errParam, desc))
		s.renderCallbackPage(w, false, "Authorization failed.")
		return
	}

	code := query.Get("code")
	state := query.Get("state")

	s.oauthMu.Lock()
	expected := s.oauthState
	s.oauthMu.Unlock()
	if expected == "" || state != expected {
		s.finishOAuth(nil, fmt.Errorf("invalid OAuth state"))
		s.renderCallbackPage(w, false, "Invalid OAuth state.")
		return
	}

	if code == "" {
		s.finishOAuth(nil, fmt.Errorf("missing OAuth code"))
		s.renderCallbackPage(w, false, "Missing OAuth code.")
		return
	}

	token, err := s.exchangeCodeForToken(code)
	if err != nil {
		s.finishOAuth(nil, err)
		s.renderCallbackPage(w, false, "Failed to complete authorization.")
		return
	}
	s.accessToken = token

	username, err := s.fetchUsername()
	if err != nil {
		s.finishOAuth(nil, fmt.Errorf("failed to get GitHub user: %w", err))
		s.renderCallbackPage(w, false, "Failed to fetch user.")
		return
	}
	s.username = username

	teams, err := s.fetchTeamsForUser(username)
	if err != nil {
		s.finishOAuth(nil, fmt.Errorf("failed to fetch teams: %w", err))
		s.renderCallbackPage(w, false, "Failed to fetch teams.")
		return
	}
	s.teams = teams
	_ = s.saveToken()

	perms := s.computePermissions()
	s.finishOAuth(perms, nil)
	s.renderCallbackPage(w, true, "You can return to DevKit.")
}

func (s *GitHubService) finishOAuth(perms *Permissions, err error) {
	s.oauthMu.Lock()
	defer s.oauthMu.Unlock()
	if s.authResultCh != nil {
		s.authResultCh <- authResult{perms: perms, err: err}
		close(s.authResultCh)
	}
	s.oauthState = ""
	s.authResultCh = nil
}

func (s *GitHubService) renderCallbackPage(w http.ResponseWriter, success bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	title := "Authorization failed"
	if success {
		title = "Authorization complete"
	}
	body := fmt.Sprintf(`<!doctype html>
<html>
<head><title>%s</title></head>
<body style="font-family: sans-serif; padding: 32px;">
<h2>%s</h2>
<p>%s</p>
<p>You can close this window.</p>
</body>
</html>`, title, title, message)
	_, _ = io.WriteString(w, body)
}

func (s *GitHubService) exchangeCodeForToken(code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", s.appClientID)
	form.Set("client_secret", s.appClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", s.callbackURL)

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		Scope       string `json:"scope"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("invalid response from GitHub: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("GitHub error: %s — %s", result.Error, result.ErrorDesc)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("missing access token from GitHub")
	}
	return result.AccessToken, nil
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
	username, err := s.fetchUsername()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username

	return s.computePermissions()
}

// Disconnect clears the stored token and returns disconnected state.
func (s *GitHubService) Disconnect() *Permissions {
	s.clearToken()
	return &Permissions{Connected: false}
}

// RefreshTeams re-fetches team memberships from GitHub and recomputes permissions.
func (s *GitHubService) RefreshTeams() (*Permissions, error) {
	if s.accessToken == "" || s.username == "" {
		return &Permissions{Connected: false}, nil
	}

	teams, err := s.fetchTeamsForUser(s.username)
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

func (s *GitHubService) fetchUsername() (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return user.Login, nil
}

func (s *GitHubService) fetchTeamsForUser(username string) ([]string, error) {
	token, err := s.fetchInstallationToken()
	if err != nil {
		return nil, err
	}

	var orgTeams []string
	page := 1
	for {
		u := fmt.Sprintf("https://api.github.com/orgs/%s/teams?per_page=100&page=%d", s.org, page)
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
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
		}
		if err := json.Unmarshal(body, &teams); err != nil {
			return nil, err
		}
		if len(teams) == 0 {
			break
		}

		for _, t := range teams {
			member, err := s.checkTeamMembership(token, t.Slug, username)
			if err != nil {
				return nil, err
			}
			if member {
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

func (s *GitHubService) checkTeamMembership(token, teamSlug, username string) (bool, error) {
	u := fmt.Sprintf("https://api.github.com/orgs/%s/teams/%s/memberships/%s", s.org, teamSlug, username)
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return false, err
	}
	return result.State == "active", nil
}

func (s *GitHubService) fetchInstallationToken() (string, error) {
	jwtToken, err := s.createAppJWT()
	if err != nil {
		return "", err
	}

	instID, err := s.fetchInstallationID(jwtToken)
	if err != nil {
		return "", err
	}

	u := fmt.Sprintf("https://api.github.com/app/installations/%d/access_tokens", instID)
	req, err := http.NewRequest("POST", u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.Token == "" {
		return "", fmt.Errorf("missing installation token")
	}
	return result.Token, nil
}

func (s *GitHubService) fetchInstallationID(jwtToken string) (int64, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/app/installations", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var installations []struct {
		ID      int64 `json:"id"`
		Account struct {
			Login string `json:"login"`
		} `json:"account"`
	}
	if err := json.Unmarshal(body, &installations); err != nil {
		return 0, err
	}
	for _, inst := range installations {
		if strings.EqualFold(inst.Account.Login, s.org) {
			return inst.ID, nil
		}
	}
	return 0, fmt.Errorf("no GitHub App installation found for org %s", s.org)
}

func (s *GitHubService) createAppJWT() (string, error) {
	if s.appID == "" {
		return "", fmt.Errorf("GitHub App ID missing")
	}
	appID, err := strconv.ParseInt(s.appID, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid GitHub App ID: %w", err)
	}
	key, err := s.loadPrivateKey()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := map[string]interface{}{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": appID,
	}

	headerJSON, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	claimsJSON, _ := json.Marshal(claims)

	encode := func(b []byte) string {
		return base64.RawURLEncoding.EncodeToString(b)
	}
	signingInput := encode(headerJSON) + "." + encode(claimsJSON)
	hash := sha256.Sum256([]byte(signingInput))

	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}

	return signingInput + "." + encode(sig), nil
}

func (s *GitHubService) loadPrivateKey() (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(s.appPrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read GitHub App private key: %w", err)
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("invalid GitHub App private key")
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
	}
	return nil, fmt.Errorf("unsupported private key format")
}

func randomState(length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
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
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
}

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GitHubService handles GitHub App OAuth and team-based permissions.
type GitHubService struct {
	appID             string
	appClientID       string
	appClientSecret   string
	appPrivateKeyPath string
	callbackURL       string
	org               string
	devkitRoot        string

	oauthMu        sync.Mutex
	oauthState     string
	authResultCh   chan authResult
	callbackServer *http.Server

	// Auth state
	accessToken string
	username    string
	teams       []string
}

// OAuthStartResponse is returned when initiating the GitHub App OAuth flow.
type OAuthStartResponse struct {
	AuthorizationURL string `json:"authorizationUrl"`
}

// Permissions represents the computed access for the authenticated user.
type Permissions struct {
	Connected bool     `json:"connected"`
	Username  string   `json:"username"`
	Teams     []string `json:"teams"`
	Views     []string `json:"views"`
	Commands  []string `json:"commands"`
}

// storedAuth is the JSON structure persisted to disk.
type storedAuth struct {
	AccessToken string   `json:"accessToken"`
	Username    string   `json:"username"`
	Teams       []string `json:"teams"`
}

type authResult struct {
	perms *Permissions
	err   error
}

// ──────────────────────────────────────────────────────────────────────────────
// Team-to-permission mapping
// ──────────────────────────────────────────────────────────────────────────────

var baseViews = []string{"home", "projects", "activity", "settings"}
var baseCommands = []string{"Navigation", "General", "Projects", "Environment"}

var everyView = []string{"home", "projects", "infrastructure", "backend", "mesh", "plugins", "activity", "settings"}
var everyCommand = []string{"Navigation", "General", "Projects", "Infrastructure", "Backend", "Migrations", "Protobuf", "Environment"}

var teamExtraViews = map[string][]string{
	"core-devs":  {"infrastructure", "backend", "mesh"},
	"plugin-devs": {"plugins"},
}

var teamExtraCommands = map[string][]string{
	"core-devs": {"Infrastructure", "Backend", "Migrations", "Protobuf"},
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewGitHubService creates a new service and loads any persisted auth token.
func NewGitHubService(appID, appClientID, appClientSecret, appPrivateKeyPath, callbackURL, org, devkitRoot string) *GitHubService {
	svc := &GitHubService{
		appID:             appID,
		appClientID:       appClientID,
		appClientSecret:   appClientSecret,
		appPrivateKeyPath: appPrivateKeyPath,
		callbackURL:       callbackURL,
		org:               org,
		devkitRoot:        devkitRoot,
	}
	svc.loadToken()
	return svc
}

// ──────────────────────────────────────────────────────────────────────────────
// Token persistence
// ──────────────────────────────────────────────────────────────────────────────

func (s *GitHubService) authFilePath() string {
	return filepath.Join(s.devkitRoot, "github_auth.json")
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
	s.teams = stored.Teams
}

func (s *GitHubService) saveToken() error {
	stored := storedAuth{
		AccessToken: s.accessToken,
		Username:    s.username,
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
	s.teams = nil
	_ = os.Remove(s.authFilePath())
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub App OAuth
// ──────────────────────────────────────────────────────────────────────────────

// StartOAuth begins the GitHub App OAuth flow and returns the auth URL.
func (s *GitHubService) StartOAuth() (*OAuthStartResponse, error) {
	if s.appClientID == "" || s.appClientSecret == "" || s.appID == "" || s.appPrivateKeyPath == "" {
		return nil, fmt.Errorf("GitHub App configuration missing. Set WABISABY_GITHUB_APP_ID, WABISABY_GITHUB_APP_CLIENT_ID, WABISABY_GITHUB_APP_CLIENT_SECRET, WABISABY_GITHUB_APP_PRIVATE_KEY_PATH")
	}
	if s.callbackURL == "" {
		return nil, fmt.Errorf("GitHub App callback URL missing. Set WABISABY_GITHUB_APP_CALLBACK_URL")
	}

	if err := s.ensureCallbackServer(); err != nil {
		return nil, err
	}

	state, err := randomState(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate state: %w", err)
	}

	s.oauthMu.Lock()
	s.oauthState = state
	s.authResultCh = make(chan authResult, 1)
	s.oauthMu.Unlock()

	q := url.Values{}
	q.Set("client_id", s.appClientID)
	q.Set("redirect_uri", s.callbackURL)
	q.Set("state", state)

	authURL := "https://github.com/login/oauth/authorize?" + q.Encode()
	return &OAuthStartResponse{AuthorizationURL: authURL}, nil
}

// WaitForAuth blocks until the OAuth callback completes.
func (s *GitHubService) WaitForAuth() (*Permissions, error) {
	s.oauthMu.Lock()
	ch := s.authResultCh
	s.oauthMu.Unlock()
	if ch == nil {
		return nil, fmt.Errorf("no OAuth flow in progress")
	}

	select {
	case result := <-ch:
		return result.perms, result.err
	case <-time.After(10 * time.Minute):
		return nil, fmt.Errorf("authorization timed out")
	}
}

func (s *GitHubService) ensureCallbackServer() error {
	if s.callbackServer != nil {
		return nil
	}
	parsed, err := url.Parse(s.callbackURL)
	if err != nil {
		return fmt.Errorf("invalid callback URL: %w", err)
	}
	host := parsed.Host
	if host == "" {
		return fmt.Errorf("callback URL must include host")
	}
	path := parsed.Path
	if path == "" {
		path = "/oauth/callback"
	}

	mux := http.NewServeMux()
	mux.HandleFunc(path, s.handleOAuthCallback)
	ln, err := net.Listen("tcp", host)
	if err != nil {
		return fmt.Errorf("failed to start callback server at %s: %w", host, err)
	}

	server := &http.Server{
		Handler: mux,
	}
	s.callbackServer = server

	go func() {
		_ = server.Serve(ln)
	}()

	return nil
}

func (s *GitHubService) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if errParam := query.Get("error"); errParam != "" {
		desc := query.Get("error_description")
		s.finishOAuth(nil, fmt.Errorf("GitHub error: %s — %s", errParam, desc))
		s.renderCallbackPage(w, false, "Authorization failed.")
		return
	}

	code := query.Get("code")
	state := query.Get("state")

	s.oauthMu.Lock()
	expected := s.oauthState
	s.oauthMu.Unlock()
	if expected == "" || state != expected {
		s.finishOAuth(nil, fmt.Errorf("invalid OAuth state"))
		s.renderCallbackPage(w, false, "Invalid OAuth state.")
		return
	}

	if code == "" {
		s.finishOAuth(nil, fmt.Errorf("missing OAuth code"))
		s.renderCallbackPage(w, false, "Missing OAuth code.")
		return
	}

	token, err := s.exchangeCodeForToken(code)
	if err != nil {
		s.finishOAuth(nil, err)
		s.renderCallbackPage(w, false, "Failed to complete authorization.")
		return
	}
	s.accessToken = token

	username, err := s.fetchUsername()
	if err != nil {
		s.finishOAuth(nil, fmt.Errorf("failed to get GitHub user: %w", err))
		s.renderCallbackPage(w, false, "Failed to fetch user.")
		return
	}
	s.username = username

	teams, err := s.fetchTeamsForUser(username)
	if err != nil {
		s.finishOAuth(nil, fmt.Errorf("failed to fetch teams: %w", err))
		s.renderCallbackPage(w, false, "Failed to fetch teams.")
		return
	}
	s.teams = teams
	_ = s.saveToken()

	perms := s.computePermissions()
	s.finishOAuth(perms, nil)
	s.renderCallbackPage(w, true, "You can return to DevKit.")
}

func (s *GitHubService) finishOAuth(perms *Permissions, err error) {
	s.oauthMu.Lock()
	defer s.oauthMu.Unlock()
	if s.authResultCh != nil {
		s.authResultCh <- authResult{perms: perms, err: err}
		close(s.authResultCh)
	}
	s.oauthState = ""
	s.authResultCh = nil
}

func (s *GitHubService) renderCallbackPage(w http.ResponseWriter, success bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	title := "Authorization failed"
	if success {
		title = "Authorization complete"
	}
	body := fmt.Sprintf(`<!doctype html>
<html>
<head><title>%s</title></head>
<body style="font-family: sans-serif; padding: 32px;">
<h2>%s</h2>
<p>%s</p>
<p>You can close this window.</p>
</body>
</html>`, title, title, message)
	_, _ = io.WriteString(w, body)
}

func (s *GitHubService) exchangeCodeForToken(code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", s.appClientID)
	form.Set("client_secret", s.appClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", s.callbackURL)

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		Scope       string `json:"scope"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("invalid response from GitHub: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("GitHub error: %s — %s", result.Error, result.ErrorDesc)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("missing access token from GitHub")
	}
	return result.AccessToken, nil
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
	username, err := s.fetchUsername()
	if err != nil {
		// Token invalid/revoked — clear it.
		s.clearToken()
		return &Permissions{Connected: false}
	}
	s.username = username

	return s.computePermissions()
}

// Disconnect clears the stored token and returns disconnected state.
func (s *GitHubService) Disconnect() *Permissions {
	s.clearToken()
	return &Permissions{Connected: false}
}

// RefreshTeams re-fetches team memberships from GitHub and recomputes permissions.
func (s *GitHubService) RefreshTeams() (*Permissions, error) {
	if s.accessToken == "" || s.username == "" {
		return &Permissions{Connected: false}, nil
	}

	teams, err := s.fetchTeamsForUser(s.username)
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

func (s *GitHubService) fetchUsername() (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return user.Login, nil
}

func (s *GitHubService) fetchTeamsForUser(username string) ([]string, error) {
	token, err := s.fetchInstallationToken()
	if err != nil {
		return nil, err
	}

	var orgTeams []string
	page := 1
	for {
		u := fmt.Sprintf("https://api.github.com/orgs/%s/teams?per_page=100&page=%d", s.org, page)
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
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
		}
		if err := json.Unmarshal(body, &teams); err != nil {
			return nil, err
		}
		if len(teams) == 0 {
			break
		}

		for _, t := range teams {
			member, err := s.checkTeamMembership(token, t.Slug, username)
			if err != nil {
				return nil, err
			}
			if member {
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

func (s *GitHubService) checkTeamMembership(token, teamSlug, username string) (bool, error) {
	u := fmt.Sprintf("https://api.github.com/orgs/%s/teams/%s/memberships/%s", s.org, teamSlug, username)
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return false, err
	}
	return result.State == "active", nil
}

func (s *GitHubService) fetchInstallationToken() (string, error) {
	jwtToken, err := s.createAppJWT()
	if err != nil {
		return "", err
	}

	instID, err := s.fetchInstallationID(jwtToken)
	if err != nil {
		return "", err
	}

	u := fmt.Sprintf("https://api.github.com/app/installations/%d/access_tokens", instID)
	req, err := http.NewRequest("POST", u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.Token == "" {
		return "", fmt.Errorf("missing installation token")
	}
	return result.Token, nil
}

func (s *GitHubService) fetchInstallationID(jwtToken string) (int64, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/app/installations", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var installations []struct {
		ID      int64 `json:"id"`
		Account struct {
			Login string `json:"login"`
		} `json:"account"`
	}
	if err := json.Unmarshal(body, &installations); err != nil {
		return 0, err
	}
	for _, inst := range installations {
		if strings.EqualFold(inst.Account.Login, s.org) {
			return inst.ID, nil
		}
	}
	return 0, fmt.Errorf("no GitHub App installation found for org %s", s.org)
}

func (s *GitHubService) createAppJWT() (string, error) {
	if s.appID == "" {
		return "", fmt.Errorf("GitHub App ID missing")
	}
	appID, err := strconv.ParseInt(s.appID, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid GitHub App ID: %w", err)
	}
	key, err := s.loadPrivateKey()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := map[string]interface{}{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": appID,
	}

	headerJSON, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	claimsJSON, _ := json.Marshal(claims)

	encode := func(b []byte) string {
		return base64.RawURLEncoding.EncodeToString(b)
	}
	signingInput := encode(headerJSON) + "." + encode(claimsJSON)
	hash := sha256.Sum256([]byte(signingInput))

	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}

	return signingInput + "." + encode(sig), nil
}

func (s *GitHubService) loadPrivateKey() (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(s.appPrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read GitHub App private key: %w", err)
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("invalid GitHub App private key")
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
	}
	return nil, fmt.Errorf("unsupported private key format")
}

func randomState(length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
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
		Teams:     s.teams,
		Views:     views,
		Commands:  commands,
	}
}
*/
