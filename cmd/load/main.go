package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
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
}
