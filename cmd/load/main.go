package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Targets  []string
	RPS      int
	Duration time.Duration
	Workers  int
}

func main() {
	targetsFlag := flag.String("targets", "http://localhost:8080", "comma-separated list of target urls")
	rpsFlag := flag.Int("rps", 100, "target requests per second")
	durationFlag := flag.Int("duration", 10, "duration of the test in seconds")
	workersFlag := flag.Int("workers", 10, "number of concurrent workers")

	flag.Parse()

	if *targetsFlag == "" {
		fmt.Fprintln(os.Stderr, "error: targets cannot be empty")
		flag.Usage()
		os.Exit(1)
	}

	targets := strings.Split(*targetsFlag, ",")
	for i, t := range targets {
		targets[i] = strings.TrimSpace(t)
	}

	cfg := Config{
		Targets:  targets,
		RPS:      *rpsFlag,
		Duration: time.Duration(*durationFlag) * time.Second,
		Workers:  *workersFlag,
	}

	fmt.Printf("tobira load generator starting...\n")
	fmt.Printf("targets:  %v\n", cfg.Targets)
	fmt.Printf("rps:      %d\n", cfg.RPS)
	fmt.Printf("duration: %s\n", cfg.Duration)
	fmt.Printf("workers:  %d\n", cfg.Workers)

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Duration)
	defer cancel()

	tasks := make(chan string, cfg.Workers*2)

	var wg sync.WaitGroup
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	for i := 0; i < cfg.Workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case url, ok := <-tasks:
					if !ok {
						return
					}
					req, err := http.NewRequestWithContext(ctx, "get", url, nil)
					if err != nil {
						continue
					}
					resp, err := client.Do(req)
					if err != nil {
						continue
					}
					resp.Body.Close()
				}
			}
		}(i)
	}

	go func() {
		defer close(tasks)
		ticker := time.NewTicker(time.Second / time.Duration(cfg.RPS))
		defer ticker.Stop()

		var requestCount int
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				target := cfg.Targets[requestCount%len(cfg.Targets)]
				select {
				case tasks <- target:
					requestCount++
				default:
				}
			}
		}
	}()

	wg.Wait()
	fmt.Printf("load test finished\n")
}
