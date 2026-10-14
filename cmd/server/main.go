package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"hopmio/core-go/api"
	"hopmio/core-go/daemon"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	port := flag.Int("port", 5173, "HTTP 服务监听端口")
	dataDir := flag.String("data", ".state", "状态持久化目录")
	webDir := flag.String("web", "dist", "前端静态资源目录")
	flag.Parse()

	// 转换为绝对路径
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("无法获取当前工作目录: %w", err)
	}

	absData := *dataDir
	if !filepath.IsAbs(absData) {
		absData = filepath.Join(cwd, absData)
	}
	absWeb := *webDir
	if !filepath.IsAbs(absWeb) {
		absWeb = filepath.Join(cwd, absWeb)
	}

	// 确保状态目录存在
	if err := os.MkdirAll(absData, 0755); err != nil {
		return fmt.Errorf("无法创建状态目录 %s: %w", absData, err)
	}

	fmt.Println("==================================================")
	fmt.Println("呀哈造物 · YaHa 核心宿主服务 (Go Core)")
	fmt.Printf("访问地址: http://127.0.0.1:%d/\n", *port)
	fmt.Printf("状态目录: %s\n", absData)
	fmt.Printf("前端目录: %s\n", absWeb)
	fmt.Println("==================================================")

	// 启动引擎守护进程
	sup := daemon.NewSupervisor(cwd, absData)
	if err := sup.Start(); err != nil {
		log.Fatalf("Python 几何与 AI 引擎启动失败: %v", err)
	}
	defer sup.Close()

	// 启动 HTTP 服务
	srv := api.NewServer(sup, absWeb)
	addr := fmt.Sprintf("127.0.0.1:%d", *port)

	// 信号监听
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		fmt.Println("\n正在平稳关闭造物宿主与引擎...")
		sup.Close()
		os.Exit(0)
	}()

	if err := srv.Start(addr); err != nil {
		return fmt.Errorf("HTTP 服务启动异常: %w", err)
	}
	return nil
}
