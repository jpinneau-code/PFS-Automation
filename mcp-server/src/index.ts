import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3334
const HOST = process.env.HOST || '0.0.0.0'

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'pfs-automation-mcp-server'
  })
})

// Placeholder for MCP endpoints
app.get('/mcp/status', (req, res) => {
  res.json({
    status: 'running',
    version: '1.0.0'
  })
})

app.listen(Number(PORT), HOST, () => {
  console.log(`MCP Server running on ${HOST}:${PORT}`)
})
