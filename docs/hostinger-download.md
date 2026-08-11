# Downloading WordPress Files Backup via SSH (Hostinger)

*Why this method:* Hostinger's browser-based backup download (hPanel → Backups) can fail partway through on large files — "decompression failed," "check internet connection," or stalled downloads across different browsers. SSH + rsync pulls the files directly from the server to your local machine instead, and can resume if the connection drops.

This grabs a *fresh copy of your current live files*, not a specific past "prepared" backup snapshot from hPanel's Backups tool.

---

## Step 1 — Enable SSH Access

1. Go to *hPanel* → *Websites*
2. Click *Dashboard* for the site
3. Go to *Advanced* → *Remote Access* (SSH Access)
4. Enable *SSH Access* if it isn't already on
5. Enable *Password Access* (needed to log in with your hosting password instead of SSH keys)
6. Note down the *Host*, *Port*, and *Username* shown on this page

Example credentials format:
- Host: [server].hstgr.io
- Port: [port]
- Username: u[account]_[siteid]
- Site path: ~/websites/[siteid]/public_html

---

## Step 2 — Connect via SSH

Open a terminal application on your machine (Terminal on macOS, Terminal/WSL on Linux, PowerShell/Git Bash/WSL on Windows):

ssh -p [port] [username]@[host]

Enter your hosting account password when prompted (same one used for FTP/SSH — may differ from your hPanel login, and is resettable on the same Remote Access page).

---

## Step 3 — (Optional) Check for folders to exclude

If you have old/unneeded folders (e.g. a leftover backup plugin folder) you don't want included:

find ~/websites/[siteid]/public_html -iname "OLD" -o -iname "updraft"

To permanently delete one (⚠️ irreversible — check size first):

du -sh ~/websites/[siteid]/public_html/wp-content/OLD
rm -rf ~/websites/[siteid]/public_html/wp-content/OLD

---

## Step 4 — Compress the site files

Home/site directories can sometimes deny write access even if you own them — compressing to /tmp avoids this:

tar -czvf /tmp/files-backup.tar.gz -C ~/websites/[siteid] public_html

*Optional — exclude a folder instead of deleting it:*

tar -czvf /tmp/files-backup.tar.gz --exclude='wp-content/OLD' -C ~/websites/[siteid] public_html

---

## Step 5 — Check the archive size

ls -lh /tmp/files-backup.tar.gz

---

## Step 6 — Download to your local machine

⚠️ *Open a NEW, separate terminal window* — do not run this inside the SSH session. Keep the SSH session open in its own window.

In the new local terminal window:

rsync -avzP -e "ssh -p [port]" [username]@[host]:/tmp/files-backup.tar.gz ~/Downloads/

- Type yes if asked to trust the host key
- Enter your password when prompted
- If it drops partway, rerun the *exact same command* — rsync resumes instead of restarting

---

## Step 7 — Verify the download

ls -lh ~/Downloads/files-backup.tar.gz

Should match the size shown in Step 5. (On Windows without WSL, check the file size via File Explorer instead.)

---

## Step 8 — Clean up the server

Back in your *SSH session*:

rm /tmp/files-backup.tar.gz
ls -lh /tmp/files-backup.tar.gz

Second command should return "No such file or directory" once confirmed deleted.

exit

---

## Notes

- /tmp is temporary storage — always delete the archive after downloading, don't leave it there long-term
- rsync is preferred over scp for large files since it can resume interrupted transfers
- Also works for the database: use wp db export or mysqldump to create a .sql file, then compress and download the same way

---

# Restoring the Backup

Two options: SSH (recommended, especially for large files) or File Manager. Either way, back up or rename the current public_html first — don't extract directly over live files without a fallback.

## Option A — Restore via SSH

*1. Upload the backup back to the server*

From a local terminal (not inside an SSH session):

rsync -avzP -e "ssh -p [port]" ~/Downloads/files-backup.tar.gz [username]@[host]:/tmp/

*2. SSH in and extract to a temporary folder first*

ssh -p [port] [username]@[host]
mkdir /tmp/restore
tar -xzvf /tmp/files-backup.tar.gz -C /tmp/restore

*3. Set aside the current live files* (⚠️ don't skip this — gives you a fallback if something goes wrong)

mv ~/websites/[siteid]/public_html ~/websites/[siteid]/public_html-old

*4. Move the restored files into place*

mv /tmp/restore/public_html ~/websites/[siteid]/public_html

*5. Verify the site loads correctly*, then clean up:

rm -rf /tmp/restore /tmp/files-backup.tar.gz

Only delete public_html-old once you've confirmed everything works.

## Option B — Restore via File Manager

1. hPanel → *Websites* → *Dashboard* → *File Manager*
2. Navigate to the site's root folder
3. Click *Upload*, select files-backup.tar.gz (File Manager supports archives up to 100GB)
4. Once uploaded, right-click it → *Extract*, and name the destination folder (e.g. restore)
5. Open the extracted restore/public_html folder, select all files, and *Move* them into your actual public_html
6. Delete the uploaded .tar.gz and the now-empty extraction folder to free up space

## Restoring the Database (if included in your backup)

A files backup alone won't restore your database. If you also exported one (e.g. via wp db export or mysqldump):

- *Small databases (under 256MB):* import via *phpMyAdmin* — hPanel → Databases → phpMyAdmin → select the target database → Import → choose the .sql file
- *Larger databases:* import via SSH:
mysql -u [dbuser] -p [dbname] < db-backup.sql

Double-check the site's wp-config.php still points to the correct database name/user before testing the restored site.