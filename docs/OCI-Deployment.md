# Constitutional ERP Deployment on OCI Compute + Docker Compose

This guide deploys your full stack to an OCI Compute Instance using your existing Docker Compose setup.

## 1. Create OCI Compute Instance

### Via OCI Console
1. Sign in to [Oracle Cloud Console](https://cloud.oracle.com)
2. Compute → Instances → Create Instance
3. Configure:
   - **Image**: Ubuntu 22.04 LTS (Always Free eligible)
   - **Shape**: Ampere (ARM) or x86 (Always Free: 2 OCPUs, 12 GB RAM)
   - **Network**: Auto-create or use existing VCN
   - **Public IP**: Yes (required for HTTPS)
4. Download SSH key pair
5. Create instance (takes 1–2 min)

### Via OCI CLI
```bash
oci compute instance launch \
  --availability-domain AD-1 \
  --compartment-id <your-compartment-id> \
  --image-id ocid1.image.oc1.ca... \
  --instance-type compute \
  --shape VM.Standard.E4.Flex \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub
```

## 2. SSH into Instance

```bash
ssh -i /path/to/ssh-key.key ubuntu@<instance-public-ip>
```

## 3. Install Docker and Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add ubuntu to docker group (skip sudo for docker commands)
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
ssh -i /path/to/ssh-key.key ubuntu@<instance-public-ip>
```

## 4. Clone Repository

```bash
cd /home/ubuntu
git clone https://github.com/GavinDiaper/constitutional-erp.git
cd constitutional-erp
```

## 5. Configure Environment

### 5.1 Create Production .env Files

For each service, create `.env` at the service root with production values:

**services/user-identity/.env**
```env
NODE_ENV=production
DATABASE_PATH=/data/user-identity.db
JWT_ISSUER=constitutionalerp-user-identity
JWT_AUDIENCE=constitutionalerp-clients
JWT_SIGNING_SECRET=<strong-random-secret>
COOKIE_SECURE=true
COOKIE_DOMAIN=<your-domain>
OAUTH_MOCK_ENABLED=false
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://<your-domain>/auth/callback/google
... (other OAuth providers as needed)
```

**services/foundation-erp/.env** (if applicable)
```env
NODE_ENV=production
DATABASE_PATH=/data/foundation-erp.db
PORT=3000
... (other Foundation ERP vars)
```

**apps/ui-sveltekit/.env.production**
```env
HUB_BASE_URL=http://foundation-erp:3000/api/v1
HUB_API_KEY=<hub-api-key>
IH_BASE_URL=http://integration-hub:4017
NAVIGATOR_AI_URL=http://navigator-ai:4016/api/v1
IDENTITY_BASE_URL=http://user-identity:4008
UI_IDENTITY_LOGIN_PATH=http://user-identity-app:3000
```

### 5.2 Update docker-compose.yml for Persistence

Add volume mounts and named volumes to persist data across container restarts:

```yaml
volumes:
  foundation-erp-data:
    driver: local
  user-identity-data:
    driver: local
  # ... other volumes

services:
  foundation-erp:
    # ... existing config
    volumes:
      - foundation-erp-data:/data
  user-identity:
    volumes:
      - user-identity-data:/data
```

## 6. Configure DNS and TLS

### 6.1 Point Your Domain to OCI VM

1. Get your instance's public IP:
   ```bash
   oci compute instance list-vnic-attachments --instance-id <instance-id>
   ```
2. Update your DNS records (e.g., in Cloudflare or your registrar):
   ```
   A record: <your-domain> → <instance-public-ip>
   A record: api.* → <instance-public-ip> (if needed)
   ```

### 6.2 Set Up Reverse Proxy with Nginx + Let's Encrypt

```bash
# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/default > /dev/null <<EOF
upstream foundation_erp {
    server foundation-erp:3000;
}

upstream ui_sveltekit {
    server ui-sveltekit:4173;
}

upstream identity_app {
    server user-identity-app:3000;
}

upstream identity_api {
    server user-identity:4008;
}

server {
    listen 80;
    server_name <your-domain> *.provisia.co.uk;

    location / {
        proxy_pass http://ui_sveltekit;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /identity-ui/ {
        proxy_pass http://identity_app/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/v1/ {
        proxy_pass http://foundation_erp/api/v1/;
        proxy_set_header Host $host;
    }
}
EOF

# Enable site
sudo systemctl reload nginx

# Get TLS certificate
sudo certbot --nginx -d <your-domain> -d identity.<your-domain>
```

## 7. Start the Stack

```bash
cd /home/ubuntu/constitutional-erp

# Pull latest code
git pull origin main

# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Check health
docker-compose ps
```

## 8. Verification Gates

### Gate A: Services are running
```bash
docker-compose ps
# All services should show "Up"
```

### Gate B: Web endpoints respond
```bash
curl http://localhost:4173     # Main UI
curl http://localhost:3000     # Foundation ERP
curl http://localhost:4008     # Identity API
```

### Gate C: Full end-to-end login
1. Open https://<your-domain> in browser
2. Confirm OAuth redirect to identity UI
3. Confirm login and dashboard access

## 9. Maintenance

### Restart services
```bash
cd /home/ubuntu/constitutional-erp
docker-compose restart
```

### View logs
```bash
docker-compose logs -f <service-name>
```

### Update code and redeploy
```bash
git pull origin main
docker-compose build
docker-compose up -d
```

### Backup database
```bash
docker-compose exec user-identity cp /data/user-identity.db /data/user-identity.backup.db
docker cp constitutional-erp-user-identity-1:/data/user-identity.db ~/backups/
```

## 10. Cost Estimate (OCI Always Free)

- **Compute**: 2 OCPUs, 12 GB RAM — **FREE**
- **Storage**: 200 GB block storage — **FREE**
- **Data transfer**: 10 TB egress/month — **FREE** (after free tier, ~$0.01/GB)
- **Total**: **$0/month** (if within Always Free limits)

## Troubleshooting

**Services not starting**
```bash
docker-compose logs <service-name>
# Check for missing env vars or port conflicts
```

**Cannot reach from internet**
- Check OCI security list allows port 80, 443, 4173
- Verify DNS propagation: `nslookup <your-domain>`

**Database errors**
- Ensure volume mounts exist: `docker volume ls`
- Check data directory permissions: `sudo chown 1000:1000 /path/to/data`

**TLS certificate issues**
- Renew: `sudo certbot renew`
- Check: `sudo certbot certificates`
