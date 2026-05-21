#!/usr/bin/env python3
"""OpenBooks Launcher - Double-click to start!"""
import subprocess, sys, os, webbrowser, time

ROOT = os.path.dirname(os.path.abspath(__file__))

def main():
    print("=" * 50 + "\n       OpenBooks Launcher\n" + "=" * 50)
    os.chdir(ROOT)
    if sys.version_info < (3, 9):
        print(f"ERROR: Python 3.9+ required. Current: {sys.version}"); sys.exit(1)
    print(f"Python version: {sys.version.split()[0]}\nChecking dependencies...")
    try:
        import flask, firebase_admin; print("All dependencies installed")
    except ImportError:
        print("Installing dependencies...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '-r',
                               os.path.join(ROOT, 'requirements.txt')])
        print("Done")
    creds = os.path.join(ROOT, 'config', 'firebase-service-account.json')
    if os.path.exists(creds):
        print("Firebase configuration found")
    else:
        print("\nWARNING: config/firebase-service-account.json not found!")
        print("See README.md for setup instructions.\n")
    print("\n" + "=" * 50 + "\nStarting OpenBooks Server...\n" + "=" * 50)
    time.sleep(1)
    try: webbrowser.open("http://localhost:5000")
    except: pass
    print("\nOpenBooks running at http://localhost:5000")
    print("Press Ctrl+C to stop\n" + "=" * 50 + "\n")
    try: subprocess.run([sys.executable, os.path.join(ROOT, 'server.py')])
    except KeyboardInterrupt: print("\n\nServer stopped.")

if __name__ == "__main__": main()
