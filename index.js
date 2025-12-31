/*************************************************
 * PALCRO - ALL IN ONE LICENSE PLATFORM
 * Website + API + Auth + Discord Bot
 *************************************************/

require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcrypt")
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args))
const { Client, GatewayIntentBits } = require("discord.js")

const app = express()
app.use(express.json())

/* ===================== DATABASE ===================== */
mongoose.connect(process.env.MONGO_URI)

const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String
}))

const Key = mongoose.model("Key", new mongoose.Schema({
  key: String,
  hwid: String,
  expiresAt: Date
}))

/* ===================== UTILS ===================== */
function auth(req, res, next) {
  const token = req.headers.authorization
  if (!token) return res.status(401).end()
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).end()
  }
}

async function logDiscord(msg) {
  if (!process.env.DISCORD_WEBHOOK) return
  await fetch(process.env.DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `🟣 **Palcro**\n${msg}` })
  })
}

/* ===================== WEBSITE ===================== */
app.get("/", (req, res) => {
  res.send(`
    <h1>Palcro</h1>
    <p>Script Licensing Platform</p>
    <a href="/dashboard">Dashboard</a>
  `)
})

app.get("/dashboard", (req, res) => {
  res.send(`
    <h2>Palcro Dashboard</h2>
    <button onclick="createKey()">Create Key</button>
    <pre id="out"></pre>
    <script>
      async function createKey() {
        const r = await fetch('/api/create-key', {
          method:'POST',
          headers:{authorization:localStorage.token}
        })
        const d = await r.json()
        document.getElementById('out').innerText = d.key
      }
    </script>
  `)
})

/* ===================== AUTH ===================== */
app.post("/api/register", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10)
  await User.create({ email: req.body.email, password: hash })
  res.json({ success: true })
})

app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  if (!user) return res.status(401).end()

  const ok = await bcrypt.compare(req.body.password, user.password)
  if (!ok) return res.status(401).end()

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
  res.json({ token })
})

/* ===================== KEYS ===================== */
app.post("/api/create-key", auth, async (req, res) => {
  const key = crypto.randomBytes(16).toString("hex")
  await Key.create({
    key,
    expiresAt: new Date(Date.now() + 7 * 86400000)
  })
  await logDiscord(`Key created: \`${key}\``)
  res.json({ key })
})

/* ===================== SCRIPT LOADER ===================== */
/* Generic licensing loader (SAFE TEMPLATE) */
app.post("/api/load", async (req, res) => {
  const { key, hwid } = req.body
  const license = await Key.findOne({ key })
  if (!license) return res.status(403).end()

  if (!license.hwid) {
    license.hwid = hwid
    await license.save()
  }

  if (license.hwid !== hwid) return res.status(403).end()

  await logDiscord(`Script loaded with key: \`${key}\``)

  res.json({
    script: `
      print("Palcro licensed script loaded successfully")
    `
  })
})

/* ===================== DISCORD BOT ===================== */
if (process.env.DISCORD_BOT_TOKEN) {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  })

  bot.on("messageCreate", async msg => {
    if (!msg.content.startsWith("!")) return

    const [cmd, arg] = msg.content.split(" ")

    if (cmd === "!createkey") {
      const key = crypto.randomBytes(16).toString("hex")
      await Key.create({
        key,
        expiresAt: new Date(Date.now() + 7 * 86400000)
      })
      msg.reply(`🟣 **Palcro Key:** \`${key}\``)
    }

    if (cmd === "!revokekey") {
      await Key.deleteOne({ key: arg })
      msg.reply("❌ Key revoked")
    }
  })

  bot.login(process.env.DISCORD_BOT_TOKEN)
}

/* ===================== START ===================== */
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("Palcro running on " + PORT))
