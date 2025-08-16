# CALBOT - Cal Raleigh Home Run Notifier

A WhatsApp bot that automatically notifies your friends when Cal Raleigh hits a home run! 🏟️⚾

## Features

- **Real-time monitoring** of Seattle Mariners games
- **WhatsApp notifications** when Cal Raleigh hits a home run
- **Rich message formatting** with inning, RBI, exit velocity, and distance
- **Duplicate prevention** to avoid spam
- **Railway deployment** ready

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file with:
```
PORT=3000

# WhatsApp Recipients (phone numbers with country code, no +)
# Example: 15551234567,15559876543
RECIPIENT_NUMBERS=15551234567,15559876543

# MLB IDs (already configured)
CAL_RALEIGH_PLAYER_ID=668939
MARINERS_TEAM_ID=136

# Polling interval (15 seconds)
POLL_INTERVAL_MS=15000
```

### 3. Start Locally
```bash
npm start
```

### 4. Authenticate WhatsApp
- Scan the QR code with your WhatsApp mobile app
- Go to Settings → Linked Devices → Link a Device
- The service will remember your authentication

### 5. Test
```bash
curl -X POST http://localhost:3000/test-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"message":"Test from Cal Dinger Bot! 🏟️⚾"}'
```

## Deployment to Railway

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial Cal Dinger Bot"
git push origin main
```

### 2. Deploy on Railway
1. Go to [Railway.app](https://railway.app)
2. Create new project from GitHub
3. Select your repository
4. Add environment variables in Railway dashboard:
   - `RECIPIENT_NUMBERS`: Your friends' phone numbers
   - `POLL_INTERVAL_MS`: 15000 (optional)

### 3. Authenticate WhatsApp on Railway
- Check Railway logs for QR code
- Scan with your phone
- Service will be ready to monitor games!

## How It Works

1. **Game Detection**: Polls MLB Stats API for today's Mariners games
2. **Play Monitoring**: Checks live game feed for home run events
3. **Player Filtering**: Only triggers for Cal Raleigh (ID: 668939)
4. **WhatsApp Notification**: Sends formatted message to all recipients
5. **Duplicate Prevention**: Tracks event IDs to avoid spam

## Message Format

```
CAL DINGER! [Description] • [Inning] • [RBI] RBI • EV [Exit Velocity] mph • LA [Launch Angle]° • [Distance] ft
```

## API Endpoints

- `GET /` - Health check
- `POST /test-whatsapp` - Send test WhatsApp message

## Troubleshooting

- **400 Bad Request**: Normal when no Mariners game today
- **WhatsApp not ready**: Wait for QR code scan
- **No messages sent**: Check recipient phone numbers in `.env`

## MLB IDs Used

- **Cal Raleigh**: 668939
- **Seattle Mariners**: 136

## License

MIT License - Feel free to modify for other players/teams!
