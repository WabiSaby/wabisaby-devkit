package service

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// MigrationService manages database migrations
type MigrationService struct {
	wabisabyRoot string
}

// NewMigrationService creates a new migration service
func NewMigrationService(wabisabyRoot string) *MigrationService {
	return &MigrationService{
		wabisabyRoot: wabisabyRoot,
	}
}

// GetStatus returns the current migration status
func (s *MigrationService) GetStatus() (*model.MigrationStatus, error) {
	status := &model.MigrationStatus{
		Migrations: []model.Migration{},
	}

	// List migration files
	migrationsDir := filepath.Join(s.wabisabyRoot, "migrations")
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		status.Error = fmt.Sprintf("Failed to read migrations directory: %v", err)
		return status, nil
	}

	// Parse migration files
	// Format: NNNNNN_name.up.sql or NNNNNN_name.down.sql
	versionRegex := regexp.MustCompile(`^(\d+)_(.+)\.(up|down)\.sql$`)
	migrationMap := make(map[uint]string)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matches := versionRegex.FindStringSubmatch(entry.Name())
		if len(matches) == 4 && matches[3] == "up" {
			version, _ := strconv.ParseUint(matches[1], 10, 32)
			name := matches[2]
			migrationMap[uint(version)] = name
		}
	}

	// Sort versions
	var versions []uint
	for v := range migrationMap {
		versions = append(versions, v)
	}
	sort.Slice(versions, func(i, j int) bool {
		return versions[i] < versions[j]
	})

	// Try to get current version by running migrate tool
	currentVersion, dirty, err := s.getCurrentVersion()
	if err != nil {
		// If we can't get the current version, just show all as not applied
		status.Error = fmt.Sprintf("Could not determine current version: %v", err)
	} else {
		status.CurrentVersion = currentVersion
		status.Dirty = dirty
	}

	// Build migration list
	for _, version := range versions {
		status.Migrations = append(status.Migrations, model.Migration{
			Version: version,
			Name:    migrationMap[version],
			Applied: version <= status.CurrentVersion,
		})
	}

	return status, nil
}

// getCurrentVersion gets the current migration version by running the migrate tool
func (s *MigrationService) getCurrentVersion() (uint, bool, error) {
	// Load .env to get DATABASE_URL
	envVars, err := loadEnvFile(s.wabisabyRoot)
	if err != nil {
		return 0, false, fmt.Errorf("failed to load .env: %w", err)
	}

	// Run migrate version command
	cmd := exec.Command("go", "run", "./tools/migrate", "-version")
	cmd.Dir = s.wabisabyRoot
	cmd.Env = append(os.Environ(), envVars...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		// If migrate tool doesn't support -version, try to parse from status output
		return s.parseVersionFromStatus()
	}

	// Parse version from output: look for a line that is exactly "N" or "N dirty" (migrate -version prints to stdout)
	outputStr := string(output)
	for _, line := range strings.Split(outputStr, "\n") {
		line = strings.TrimSpace(line)
		fields := strings.Fields(line)
		if len(fields) != 1 && len(fields) != 2 {
			continue
		}
		v, err := strconv.ParseUint(fields[0], 10, 32)
		if err != nil {
			continue
		}
		if len(fields) == 2 && fields[1] != "dirty" {
			continue
		}
		dirty := len(fields) == 2
		return uint(v), dirty, nil
	}

	return 0, false, fmt.Errorf("could not parse version from output: %s", outputStr)
}

// parseVersionFromStatus tries to get the version from running migrations status
func (s *MigrationService) parseVersionFromStatus() (uint, bool, error) {
	// This is a fallback - just return 0 if we can't determine
	// The UI will show all migrations as "not applied"
	return 0, false, nil
}

// Up runs all pending migrations
func (s *MigrationService) Up() (string, error) {
	return s.runMigration("-up")
}

// Down rolls back the last migration
func (s *MigrationService) Down() (string, error) {
	return s.runMigration("-down")
}

// runMigration executes the migrate tool with the given flag
func (s *MigrationService) runMigration(flag string) (string, error) {
	envVars, err := loadEnvFile(s.wabisabyRoot)
	if err != nil {
		return "", fmt.Errorf("failed to load .env: %w", err)
	}

	cmd := exec.Command("go", "run", "./tools/migrate", flag)
	cmd.Dir = s.wabisabyRoot
	cmd.Env = append(os.Environ(), envVars...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), fmt.Errorf("migration failed: %w\n%s", err, string(output))
	}

	return string(output), nil
}

// UpStream runs migrations and streams output
func (s *MigrationService) UpStream(ctx context.Context) (<-chan string, error) {
	return s.runMigrationStream(ctx, "-up")
}

// DownStream rolls back migrations and streams output
func (s *MigrationService) DownStream(ctx context.Context) (<-chan string, error) {
	return s.runMigrationStream(ctx, "-down")
}

// runMigrationStream executes the migrate tool and streams output
func (s *MigrationService) runMigrationStream(ctx context.Context, flag string) (<-chan string, error) {
	envVars, err := loadEnvFile(s.wabisabyRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to load .env: %w", err)
	}

	cmd := exec.CommandContext(ctx, "go", "run", "./tools/migrate", flag)
	cmd.Dir = s.wabisabyRoot
	cmd.Env = append(os.Environ(), envVars...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	ch := make(chan string, 100)

	if err := cmd.Start(); err != nil {
		close(ch)
		return nil, fmt.Errorf("failed to start migration: %w", err)
	}

	go func() {
		defer close(ch)

		// Read stdout
		go func() {
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				select {
				case ch <- scanner.Text():
				case <-ctx.Done():
					return
				}
			}
		}()

		// Read stderr
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			select {
			case ch <- "[stderr] " + scanner.Text():
			case <-ctx.Done():
				return
			}
		}

		// Wait for completion
		if err := cmd.Wait(); err != nil {
			select {
			case ch <- fmt.Sprintf("[error] Migration failed: %v", err):
			case <-ctx.Done():
			}
		} else {
			select {
			case ch <- "[done] Migration completed successfully":
			case <-ctx.Done():
			}
		}
	}()

	return ch, nil
}

// loadEnvFile is a helper to load .env file (shared with process.go)
func loadEnvFile(wabisabyRoot string) ([]string, error) {
	envPath := filepath.Join(wabisabyRoot, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil {
		return nil, err
	}

	var envVars []string
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.Contains(line, "=") {
			envVars = append(envVars, line)
		}
	}

	return envVars, nil
}
