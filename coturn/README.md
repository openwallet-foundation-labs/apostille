# Coturn TURN Server Setup

This directory contains the configuration for a self-hosted TURN server using coturn. This enables WebRTC calls to work across different network types (cellular to WiFi, different NATs, etc.) without relying on third-party services.

## What is TURN?

TURN (Traversal Using Relays around NAT) is a protocol that relays audio/video traffic when direct peer-to-peer connections fail due to restrictive NATs or firewalls. This is especially important for:
- Cellular to WiFi connections
- Enterprise networks with strict firewalls
- Symmetric NAT situations

## Configuration Overview

The `turnserver.conf` file contains the coturn configuration with:
- **Listening ports**: 3478 (TURN), 5349 (TURN over TLS)
- **Media relay ports**: 49152-65535
- **Authentication**: Long-term credentials (username/password)
- **Security**: Private IP ranges blocked to prevent abuse

## Production Deployment Checklist

### 1. Change Default Credentials

**CRITICAL**: The default credentials are insecure and must be changed for production.

Edit `turnserver.conf` and replace:
```
user=turnuser:turnpassword
```

With strong, randomly generated credentials:
```
user=your_random_username:your_strong_random_password
```

Generate strong credentials:
```bash
# Generate random username and password
echo "user=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16):$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)"
```

### 2. Update Backend Environment Variables

After changing coturn credentials, update in `docker-compose.yml`:
```yaml
- WEBRTC_TURN_USERNAME=your_random_username
- WEBRTC_TURN_CREDENTIAL=your_strong_random_password
```

### 3. Configure Server URL

Replace `localhost` with your server's public IP or domain:

In `docker-compose.yml`, change:
```yaml
- WEBRTC_STUN_URLS=stun:YOUR_SERVER_IP:3478,turn:YOUR_SERVER_IP:3478,turn:YOUR_SERVER_IP:3478?transport=tcp
```

Example:
```yaml
- WEBRTC_STUN_URLS=stun:turn.yourdomain.com:3478,turn:turn.yourdomain.com:3478,turn:turn.yourdomain.com:3478?transport=tcp
```

### 4. Configure Firewall Rules

Coturn requires the following ports to be open:

**UDP and TCP:**
- **3478** - TURN server (main port)
- **5349** - TURN over TLS (optional but recommended)
- **49152-65535** - Media relay ports (UDP)

Example UFW rules:
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
```

### 5. TLS/SSL Certificates (Recommended)

For production, enable TLS by:

1. Obtain SSL certificates (Let's Encrypt recommended)
2. Uncomment and configure in `turnserver.conf`:
```
cert=/etc/coturn/turn_server_cert.pem
pkey=/etc/coturn/turn_server_pkey.pem
```

3. Mount certificates in `docker-compose.yml`:
```yaml
volumes:
  - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
  - ./coturn/certs:/etc/coturn/certs:ro
```

### 6. Monitor Server Performance

Coturn includes a CLI interface for monitoring:

```bash
# Connect to coturn CLI
docker exec -it verifiable_ai-coturn-1 turnadmin

# Check active sessions
docker exec verifiable_ai-coturn-1 turnadmin -l
```

Enable Prometheus metrics by uncommenting in `turnserver.conf`:
```
prometheus
prometheus-port=9641
```

## Testing the TURN Server

After deployment, test your TURN server:

1. **Online tester**: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   - Add your TURN server URL: `turn:YOUR_SERVER_IP:3478`
   - Username: your configured username
   - Password: your configured password
   - Click "Gather candidates"
   - You should see "relay" candidates if TURN is working

2. **Check logs**:
```bash
docker logs verifiable_ai-coturn-1
```

## Privacy Benefits

By self-hosting your TURN server:
- **No third-party metadata exposure**: Your call metadata stays on your infrastructure
- **Data sovereignty**: Full control over where relay traffic passes through
- **No usage limits**: Unlike public TURN servers with quotas
- **Better performance**: Lower latency when server is geographically close to users

## Cost Considerations

**Bandwidth**: TURN servers relay media, so they consume significant bandwidth
- Video calls: ~2-5 Mbps per active call
- Audio only: ~50-100 Kbps per active call

Budget for bandwidth accordingly, especially if scaling to many concurrent users.

## Troubleshooting

### Connections still failing

1. **Check firewall**: Ensure all required ports are open
2. **Verify credentials**: Match turnserver.conf with backend environment variables
3. **Check logs**: `docker logs verifiable_ai-coturn-1`
4. **Test TURN server**: Use the online tester mentioned above
5. **Verify external IP**: Coturn must know its external IP for NAT traversal

### High resource usage

1. **Limit concurrent sessions**: Adjust `total-quota` and `user-quota` in turnserver.conf
2. **Reduce bandwidth**: Set `max-bps` to limit per-session bandwidth
3. **Scale horizontally**: Run multiple coturn instances with load balancing

## Additional Resources

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC TURN/STUN Guide](https://webrtc.org/getting-started/turn-server)
- [RFC 5766 - TURN Protocol](https://tools.ietf.org/html/rfc5766)
