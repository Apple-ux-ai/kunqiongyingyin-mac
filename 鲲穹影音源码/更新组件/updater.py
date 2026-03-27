import sys
import os
import time
import zipfile
import shutil
import subprocess
import argparse
import traceback
import ctypes
import threading
import hashlib
import requests
from PySide6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QProgressBar, QWidget
from PySide6.QtCore import Qt, Signal, QObject, QTimer
from PySide6.QtGui import QIcon, QFont

def log(msg):
    try:
        log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "updater_log.txt")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {msg}\n")
    except:
        pass

class UpdateSignals(QObject):
    progress = Signal(int)
    status = Signal(str)
    finished = Signal(bool)

class UpdateWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(450, 180)
        
        # Central widget with styling
        self.container = QWidget()
        self.container.setObjectName("container")
        self.container.setStyleSheet("""
            QWidget#container {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #ffffff, stop:1 #f8f9fa);
                border: 1px solid #dcdfe6;
                border-radius: 12px;
            }
            QLabel#titleLabel {
                color: #2c3e50;
                font-size: 18px;
                font-weight: bold;
                font-family: "Segoe UI", "Microsoft YaHei";
            }
            QLabel#statusLabel {
                color: #5e6d82;
                font-size: 13px;
                font-family: "Segoe UI", "Microsoft YaHei";
            }
            QLabel#percentageLabel {
                color: #409eff;
                font-size: 13px;
                font-weight: bold;
                font-family: "Consolas", "Monaco";
            }
            QProgressBar {
                border: none;
                background-color: #ebeef5;
                height: 8px;
                border-radius: 4px;
            }
            QProgressBar::chunk {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #409eff, stop:1 #66b1ff);
                border-radius: 4px;
            }
        """)
        self.setCentralWidget(self.container)
        
        layout = QVBoxLayout(self.container)
        layout.setContentsMargins(35, 30, 35, 30)
        layout.setSpacing(12)
        
        # Title and Percentage Row
        header_layout = QVBoxLayout()
        header_layout.setSpacing(4)
        
        self.title_label = QLabel("正在升级系统")
        self.title_label.setObjectName("titleLabel")
        header_layout.addWidget(self.title_label)
        
        layout.addLayout(header_layout)
        
        # Status Row
        status_row = QWidget()
        status_row_layout = QVBoxLayout(status_row)
        status_row_layout.setContentsMargins(0, 0, 0, 0)
        status_row_layout.setSpacing(8)
        
        self.status_label = QLabel("准备就绪...")
        self.status_label.setObjectName("statusLabel")
        status_row_layout.addWidget(self.status_label)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        status_row_layout.addWidget(self.progress_bar)
        
        layout.addWidget(status_row)
        
        # Percentage Label (Absolute positioned or in layout)
        self.percentage_label = QLabel("0%")
        self.percentage_label.setObjectName("percentageLabel")
        self.percentage_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        # Add to header or as a separate row
        layout.addWidget(self.percentage_label)
        
        # Shadow effect
        try:
            from PySide6.QtWidgets import QGraphicsDropShadowEffect
            from PySide6.QtGui import QColor
            shadow = QGraphicsDropShadowEffect(self)
            shadow.setBlurRadius(30)
            shadow.setColor(QColor(0, 0, 0, 60))
            shadow.setOffset(0, 8)
            self.container.setGraphicsEffect(shadow)
        except:
            pass

    def update_status(self, text):
        self.status_label.setText(text)

    def update_progress(self, value):
        self.progress_bar.setValue(value)
        self.percentage_label.setText(f"{value}%")

def is_process_running(pid):
    if pid <= 0:
        return False
    try:
        # 使用 ctypes 替代 tasklist 等外部命令
        kernel32 = ctypes.windll.kernel32
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        process = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if process:
            exit_code = ctypes.c_ulong()
            kernel32.GetExitCodeProcess(process, ctypes.byref(exit_code))
            kernel32.CloseHandle(process)
            return exit_code.value == 259  # STILL_ACTIVE
        return False
    except:
        return False

def kill_process(pid):
    log(f"Attempting to kill process {pid}")
    try:
        # 使用 ctypes 直接终止进程，避免 taskkill 弹出控制台
        kernel32 = ctypes.windll.kernel32
        PROCESS_TERMINATE = 0x0001
        handle = kernel32.OpenProcess(PROCESS_TERMINATE, False, pid)
        if handle:
            kernel32.TerminateProcess(handle, 1)
            kernel32.CloseHandle(handle)
            log(f"Process {pid} terminated via ctypes")
            return True
        return False
    except Exception as e:
        log(f"Failed to kill process via ctypes: {e}")
        return False

def update_worker(args, signals):
    try:
        # 1. Wait for main app to exit
        if args.pid:
            signals.status.emit("正在关闭主程序...")
            signals.progress.emit(5)
            start_time = time.time()
            timeout = 10
            while is_process_running(args.pid):
                if time.time() - start_time > timeout:
                    log(f"Process {args.pid} did not exit. Killing it.")
                    kill_process(args.pid)
                    time.sleep(1)
                    break
                time.sleep(0.5)
        
        signals.progress.emit(10)
        
        # 2. Handle download if URL is provided
        zip_path = args.zip
        if args.url:
            signals.status.emit("正在下载更新包...")
            try:
                temp_dir = os.path.dirname(args.zip) if args.zip else os.environ.get('TEMP', '.')
                if not zip_path:
                    zip_path = os.path.join(temp_dir, "update_package.zip")
                
                response = requests.get(args.url, stream=True, timeout=30)
                total_size = int(response.headers.get('content-length', 0))
                
                downloaded = 0
                sha256 = hashlib.sha256()
                with open(zip_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            sha256.update(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                progress = 10 + int(downloaded / total_size * 40) # 10% to 50%
                                signals.progress.emit(progress)
                
                # Verify hash if provided
                if args.hash:
                    actual_hash = sha256.hexdigest()
                    if actual_hash.lower() != args.hash.lower():
                        log(f"Hash mismatch. Expected: {args.hash}, Actual: {actual_hash}")
                        signals.status.emit("校验失败：下载文件损坏")
                        signals.finished.emit(False)
                        return
                
                log("Download successful")
            except Exception as e:
                log(f"Download failed: {e}")
                signals.status.emit(f"下载失败: {str(e)}")
                signals.finished.emit(False)
                return
        
        # 3. Install update
        signals.status.emit("正在安装更新...")
        signals.progress.emit(50)
        
        max_retries = 5
        success = False
        for i in range(max_retries):
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    files = zip_ref.namelist()
                    total_files = len(files)
                    for idx, file in enumerate(files):
                        if "updater.exe" in file.lower():
                            continue
                        zip_ref.extract(file, args.dir)
                        progress = 50 + int((idx + 1) / total_files * 40) # 50% to 90%
                        signals.progress.emit(progress)
                
                success = True
                log("Extraction successful")
                break
            except PermissionError as e:
                log(f"Permission error (attempt {i+1}/{max_retries}): {e}")
                signals.status.emit(f"正在重试 ({i+1}/{max_retries})...")
                time.sleep(2)
            except Exception as e:
                log(f"Error during installation (attempt {i+1}/{max_retries}): {e}")
                time.sleep(1)
        
        if not success:
            signals.status.emit("安装失败：文件被占用")
            signals.finished.emit(False)
            return

        signals.progress.emit(95)
        signals.status.emit("清理并重启...")
        
        # 4. Cleanup
        try:
            if zip_path and os.path.exists(zip_path):
                os.remove(zip_path)
                log("Cleaned up zip file")
        except Exception as e:
            log(f"Failed to remove zip: {e}")

        # 5. Restart
        exe_path = os.path.join(args.dir, args.exe)
        if os.path.exists(exe_path):
            try:
                subprocess.Popen([exe_path], cwd=args.dir, 
                               creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
                log("Application restarted")
                signals.progress.emit(100)
                signals.finished.emit(True)
            except Exception as e:
                log(f"Failed to restart application: {e}")
                signals.status.emit("启动失败，请手动打开程序")
                signals.finished.emit(False)
        else:
            log(f"Executable not found: {exe_path}")
            signals.status.emit("未找到主程序")
            signals.finished.emit(False)
            
    except Exception as e:
        log(f"Critical error in worker: {traceback.format_exc()}")
        signals.status.emit("更新出错，请联系支持")
        signals.finished.emit(False)

def main():
    parser = argparse.ArgumentParser(description='Independent Updater')
    parser.add_argument('--zip', help='Path to local update zip file')
    parser.add_argument('--url', help='URL to download update package')
    parser.add_argument('--hash', help='Expected SHA256 hash of the package')
    parser.add_argument('--dir', required=True, help='Installation directory')
    parser.add_argument('--exe', required=True, help='Main executable name to restart')
    parser.add_argument('--pid', type=int, help='PID of the main process to wait for')
    
    args = parser.parse_args()
    
    app = QApplication(sys.argv)
    window = UpdateWindow()
    window.show()
    
    screen_geometry = app.primaryScreen().geometry()
    window.move((screen_geometry.width() - window.width()) // 2,
                (screen_geometry.height() - window.height()) // 2)
    
    signals = UpdateSignals()
    signals.status.connect(window.update_status)
    signals.progress.connect(window.update_progress)
    
    def on_finished(success):
        if success:
            QTimer.singleShot(1000, app.quit)
        else:
            QTimer.singleShot(5000, app.quit)
            
    signals.finished.connect(on_finished)
    
    worker_thread = threading.Thread(target=update_worker, args=(args, signals))
    worker_thread.daemon = True
    worker_thread.start()
    
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
