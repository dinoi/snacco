# Snacco Migration to Railway

This guide walks through deploying Snacco to Railway with GitHub OAuth and Railway Object Storage.

## Prerequisites

1. **GitHub Account** — For OAuth authentication
2. **Railway Account** — https://railway.app
3. **GitHub Repository** — Code must be pushed to GitHub

## Step 1: Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** Snacco
   - **Homepage URL:** `https://your-railway-domain.railway.app` (you'll get this from Railway)
   - **Authorization callback URL:** `https://your-railway-domain.railway.app/api/oauth/callback`
4. Copy the **Client ID** and **Client Secret**

## Step 2: Push Code to GitHub

```bash
cd /home/ubuntu/snacco
git init
git add .
git commit -m "Initial commit: migrate from Manus to Railway"
git remote add origin https://github.com/dinoi/snacco.git
git branch -M main
git push -u origin main
```

## Step 3: Create Railway Project

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Authorize GitHub and select `dinoi/snacco` repository
5. Railway will auto-detect Node.js and create a service

## Step 4: Add PostgreSQL Database

1. In Railway dashboard, click "Add Service"
2. Select "Database" → "PostgreSQL"
3. Railway will create a PostgreSQL instance and set `DATABASE_URL` automatically

## Step 5: Add Railway Object Storage

1. In Railway dashboard, click "Add Service"
2. Select "Storage" → "S3"
3. Railway will create object storage and provide credentials

## Step 6: Configure Environment Variables

In Railway dashboard, go to your Node.js service and add these variables:

```
JWT_SECRET=<generate-a-random-secret>
GITHUB_CLIENT_ID=<from-step-1>
GITHUB_CLIENT_SECRET=<from-step-1>
APP_URL=https://<your-railway-domain>.railway.app
RAILWAY_STORAGE_ENDPOINT=<from-storage-service>
RAILWAY_ACCESS_KEY_ID=<from-storage-service>
RAILWAY_SECRET_ACCESS_KEY=<from-storage-service>
RAILWAY_STORAGE_BUCKET=snacco
RAILWAY_STORAGE_PUBLIC_URL=<from-storage-service>
NODE_ENV=production
```

## Step 7: Deploy

1. Railway will auto-deploy on git push
2. Check deployment logs in Railway dashboard
3. Once deployed, your app will be available at `https://<your-railway-domain>.railway.app`

## Step 8: Test Uploads

1. Visit your Railway domain
2. Sign in with GitHub
3. Try uploading a demo clip and tutorial
4. Verify no 413 errors (the main issue is now fixed!)

## Troubleshooting

### Database Connection Error
- Check `DATABASE_URL` is set correctly
- Verify PostgreSQL service is running in Railway

### Storage Upload Fails
- Verify all `RAILWAY_STORAGE_*` variables are set
- Check storage bucket name matches `RAILWAY_STORAGE_BUCKET`

### GitHub OAuth Fails
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Check `APP_URL` matches your Railway domain exactly
- Verify OAuth callback URL in GitHub settings matches `https://<your-railway-domain>.railway.app/api/oauth/callback`

## Next Steps

After successful deployment:
1. Add custom domain (Railway allows custom domains)
2. Set up CI/CD for automated deployments
3. Monitor logs and errors in Railway dashboard
4. Scale up if needed (Railway auto-scales based on traffic)

