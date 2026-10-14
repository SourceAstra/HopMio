.PHONY: all build run clean

all: build

# 编译 Go 宿主服务为单二进制 (YaHa)
build:
	mkdir -p bin
	go build -o bin/yaha ./cmd/server
	ln -sf yaha bin/hopmio

# 直接运行 Go 宿主（零 Node.js 依赖）
run:
	go run ./cmd/server -port 5173 -data .state -web dist

# 清理临时文件
clean:
	rm -rf bin/ .artifacts/ __pycache__
