# Deploying PDF Flipbook Viewer to Windows Server

This guide allows you to run the PDF Viewer application on a Windows Server environment so it can be accessed by other computers in your local network.

## Prerequisites on Windows Server

1.  **Node.js**:
    *   Download the **LTS** version from [nodejs.org](https://nodejs.org/).
    *   Run the installer and accept defaults.
    *   Open PowerShell and type `node -v` to confirm installation.

2.  **Files**:
    *   Copy the entire `pdf-flipbook` folder from your development machine to the server (e.g., `C:\Apps\pdf-flipbook`).
    *   **Note**: You do NOT need to copy the `node_modules` folder (it's huge). We will install it on the server.

## Step 1: Install Dependencies

1.  Open **PowerShell** or **Command Prompt** on the server.
2.  Navigate to your app folder:
    ```powershell
    cd C:\Apps\pdf-flipbook
    ```
3.  Install the required packages:
    ```powershell
    npm install
    ```

## Step 2: Open Firewall Port

By default, Windows Server blocks incoming connections. You need to allow traffic on port **3000**.

1.  Run **Powershell** as Administrator.
2.  Run this command:
    ```powershell
    New-NetFirewallRule -DisplayName "HMU Flipbook App" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
    ```

## Step 3: Run with PM2 (Process Manager)

"PM2" is a production process manager that keeps your app running in the background, protects it from crashes, and facilitates log management.

1.  **Install PM2 globally**:
    ```powershell
    npm install -g pm2
    ```
2.  **Start your app**:
    ```powershell
    pm2 start server.js --name "pdf-flipbook"
    ```
3.  **Check status**:
    ```powershell
    pm2 status
    ```

## Step 4: Configure Auto-Start (Crucial for Servers)

To ensure the application starts automatically when the Windows Server restarts (e.g., after updates or power loss), you must install it as a Windows Service.

We recommend using `pm2-windows-startup`:

1.  **Install the startup package**:
    Open PowerShell as Administrator and run:
    ```powershell
    npm install -g pm2-windows-startup
    ```

2.  **Install the Windows Service**:
    ```powershell
    pm2-startup install
    ```
    *Note: This command registers the PM2 service with Windows.*

3.  **Save your current list**:
    Ensure your app is running (check `pm2 status`), then run:
    ```powershell
    pm2 save
    ```
    *This freezes the current process list so it can be resurrected on reboot.*

4.  **Verification**:
    *   Restart the Windows Server.
    *   Wait 1-2 minutes after boot.
    *   Try accessing the web page. It should be online automatically.

## Step 5: Access the App

1.  Find the **IP Address** of your Windows Server (run `ipconfig`).
    *   Example: `192.168.1.50`
2.  From any computer in the network, open Chrome/Edge.
3.  Go to: `http://192.168.1.50:3000/viewpdf.html`

## Useful Commands

- **Stop App**: `pm2 stop pdf-flipbook`
- **Restart App**: `pm2 restart pdf-flipbook`
- **View Logs**: `pm2 logs pdf-flipbook`
- **Update App**:
  1.  `pm2 stop pdf-flipbook`
  2.  Replace files in folder.
  3.  `pm2 restart pdf-flipbook`
