// language: JavaScript, file: index.js, runtime: Kettu (Vendetta-based)
// no settings export, no hash dependency, all API calls wrapped.

const CONFIG = {
  defaultReply: "hey — i'm afk right now, i'll reply when i'm back.",
  cooldownMs: 30 * 60 * 1000,
  replyToDMs: true,
  replyToMentionsInServers: true,
  replyToAllServerMessages: false,
  ignoreBots: true,
  ignoreUsers: [],
  perUser: {},
  perUserCooldown: {},
};

let enabled = true;
let unpatchSend = null;
const lastReply = new Map();
const lastReplyUser = new Map();

function getStore(name) {
  try { return vendetta?.metro?.findByStoreName?.(name) ?? null; } catch (e) { return null; }
}
function getByProps(...p) {
  try { return vendetta?.metro?.findByProps?.(...p) ?? null; } catch (e) { return null; }
}
function getSelfId() {
  try { return getStore("UserStore")?.getCurrentUser?.()?.id ?? null; } catch (e) { return null; }
}
function isBot(id) {
  if (!CONFIG.ignoreBots) return false;
  try { return !!getStore("UserStore")?.getUser?.(id)?.bot; } catch (e) { return false; }
}
function replyTextFor(id) { return CONFIG.perUser[id] ?? CONFIG.defaultReply; }
function cooldownFor(id) { return CONFIG.perUserCooldown[id] ?? CONFIG.cooldownMs; }
function passesCooldown(c, a) {
  const n = Date.now(), cd = cooldownFor(a);
  return (n - (lastReply.get(c) ?? 0) >= cd) && (n - (lastReplyUser.get(a) ?? 0) >= cd);
}
function shouldReply({ channelId, authorId, isDM, isMention }) {
  if (!enabled) return false;
  if (authorId === getSelfId()) return false;
  if (CONFIG.ignoreUsers.includes(authorId)) return false;
  if (isBot(authorId)) return false;
  if (isDM) { if (!CONFIG.replyToDMs) return false; }
  else {
    if (isMention && !CONFIG.replyToMentionsInServers) return false;
    if (!isMention && !CONFIG.replyToAllServerMessages) return false;
  }
  return passesCooldown(channelId, authorId);
}
async function sendReply({ channelId, messageId, authorId, isDM }) {
  try {
    const sendMessage = getByProps("sendMessage", "editMessage")?.sendMessage;
    if (!sendMessage) return;
    await sendMessage(channelId, {
      content: replyTextFor(authorId),
      messageReference: isDM ? undefined : { channel_id: channelId, message_id: messageId },
      allowedMentions: { parse: [], replied_user: false },
    });
    const n = Date.now();
    lastReply.set(channelId, n);
    lastReplyUser.set(authorId, n);
  } catch (e) { vendetta.logger.warn("[AFK] send failed", e?.message); }
}
function patchIncoming() {
  try {
    const MS = getStore("MessageStore");
    if (!MS || !vendetta?.patcher?.after) return;
    unpatchSend = vendetta.patcher.after("AFK-v2", MS, "receiveMessage", (self, args, ret) => {
      try {
        const m = args?.[0];
        if (!m?.channel_id || !m?.author?.id) return ret;
        const selfId = getSelfId();
        if (m.author.id === selfId) return ret;
        const channel = getStore("ChannelStore")?.getChannel?.(m.channel_id);
        if (!channel) return ret;
        const isDM = channel.type === 1 || channel.type === 3;
        const isMention = (m.mentions ?? []).some(x => x.id === selfId);
        if (!shouldReply({ channelId: m.channel_id, authorId: m.author.id, isDM, isMention })) return ret;
        sendReply({ channelId: m.channel_id, messageId: m.id, authorId: m.author.id, isDM }).catch(() => {});
      } catch (e) {}
      return ret;
    });
  } catch (e) { vendetta.logger.error("[AFK] patch failed", e?.message); }
}

export default {
  onLoad() {
    try { patchIncoming(); vendetta.logger.info("[AFK] loaded"); }
    catch (e) { vendetta.logger.error("[AFK] onLoad failed", e?.message); }
  },
  onUnload() {
    try { unpatchSend?.(); } catch (e) {}
  },
};
