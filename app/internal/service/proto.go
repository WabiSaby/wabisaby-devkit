package service

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/wabisaby/devkit-dashboard/internal/model"
)

const protosProjectName = "wabisaby-protos"

// ProtoService manages protobuf codegen for wabisaby-protos
type ProtoService struct {
	projectsDir string
}

// NewProtoService creates a new proto service
func NewProtoService(projectsDir string) *ProtoService {
	return &ProtoService{projectsDir: projectsDir}
}

// GetStatus returns whether generated code is out of date relative to .proto sources
func (s *ProtoService) GetStatus() (*model.ProtoStatus, error) {
	protosPath := filepath.Join(s.projectsDir, protosProjectName)
	stat, err := os.Stat(protosPath)
	if err != nil || !stat.IsDir() {
		return &model.ProtoStatus{
			OutOfDate:  false,
			Message:   "wabisaby-protos not found",
			ProtosPath: protosPath,
		}, nil
	}

	maxProtoMtime, err := maxMtimeInDir(protosPath, "api/proto", ".proto")
	if err != nil {
		return &model.ProtoStatus{
			OutOfDate:  true,
			Message:   fmt.Sprintf("Could not read proto sources: %v", err),
			ProtosPath: protosPath,
		}, nil
	}

	// No .proto files -> consider up to date
	if maxProtoMtime.IsZero() {
		return &model.ProtoStatus{
			OutOfDate:  false,
			Message:   "No proto sources found",
			ProtosPath: protosPath,
		}, nil
	}

	maxGoMtimePlugin, _ := maxMtimeInDir(protosPath, "go/plugin", ".pb.go")
	maxGoMtimeNode, _ := maxMtimeInDir(protosPath, "go/node", ".pb.go")
	var maxGoMtime time.Time
	if maxGoMtimePlugin.After(maxGoMtimeNode) {
		maxGoMtime = maxGoMtimePlugin
	} else {
		maxGoMtime = maxGoMtimeNode
	}

	if maxGoMtime.IsZero() {
		return &model.ProtoStatus{
			OutOfDate:  true,
			Message:   "Generated code missing; run Generate",
			ProtosPath: protosPath,
		}, nil
	}

	if maxProtoMtime.After(maxGoMtime) {
		return &model.ProtoStatus{
			OutOfDate:  true,
			Message:   "Proto sources newer than generated code",
			ProtosPath: protosPath,
		}, nil
	}

	return &model.ProtoStatus{
		OutOfDate:  false,
		Message:   "Up to date",
		ProtosPath: protosPath,
	}, nil
}

// maxMtimeInDir returns the latest modification time of files with the given ext under dir (relative to root)
func maxMtimeInDir(root, dir, ext string) (time.Time, error) {
	absDir := filepath.Join(root, dir)
	var max time.Time
	err := filepath.Walk(absDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if info.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ext {
			return nil
		}
		if info.ModTime().After(max) {
			max = info.ModTime()
		}
		return nil
	})
	return max, err
}

// RunProtoStream runs make proto and streams output lines to the returned channel
func (s *ProtoService) RunProtoStream(ctx context.Context) (<-chan string, error) {
	protosPath := filepath.Join(s.projectsDir, protosProjectName)
	stat, err := os.Stat(protosPath)
	if err != nil || stat == nil || !stat.IsDir() {
		return nil, fmt.Errorf("wabisaby-protos not found at %s", protosPath)
	}

	cmd := exec.CommandContext(ctx, "make", "proto")
	cmd.Dir = protosPath

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
		return nil, fmt.Errorf("failed to start make proto: %w", err)
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

		if err := cmd.Wait(); err != nil {
			select {
			case ch <- fmt.Sprintf("[error] make proto failed: %v", err):
			case <-ctx.Done():
			}
		} else {
			select {
			case ch <- "[done] Protobuf code generated successfully":
			case <-ctx.Done():
			}
		}
	}()

	return ch, nil
}
