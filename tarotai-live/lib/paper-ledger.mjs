/**
 * Atomic persistence for paper positions. Redis executes this Lua script as
 * one transaction, so ledger and open-position index cannot be half-written.
 */
export const PAPER_LEDGER_PERSIST_LUA = `
local requestKey = KEYS[1]
local ledgerKey = KEYS[2]
local openKey = KEYS[3]
local cursorKey = KEYS[4]
local requestId = ARGV[1]
local action = ARGV[2]
local tradeJson = ARGV[3]
local tradeId = ARGV[4]
local parentId = ARGV[5]
local retention = tonumber(ARGV[6]) or 1000

if requestId == '' then return {-3, 'REQUEST_ID_REQUIRED'} end
local previous = redis.call('GET', requestKey)
if previous then
  local ok, decoded = pcall(cjson.decode, previous)
  if not ok or type(decoded) ~= 'table' or not decoded.action or not decoded.trade then
    return {-3, 'REQUEST_RECORD_MALFORMED'}
  end
  if decoded.action ~= action then return {-2, previous} end
  return {0, previous}
end

local tradeOk, trade = pcall(cjson.decode, tradeJson)
if not tradeOk or type(trade) ~= 'table' or trade.id ~= tradeId then
  return {-3, 'TRADE_RECORD_MALFORMED'}
end
if action == 'OPEN' then
  if trade.status ~= 'PAPER_OPEN' then return {-3, 'OPEN_STATUS_INVALID'} end
elseif action == 'CLOSE' then
  if trade.status ~= 'PAPER_CLOSE' and trade.status ~= 'PAPER_STOP' and trade.status ~= 'PAPER_TARGET' then return {-3, 'CLOSE_STATUS_INVALID'} end
  if parentId == '' or trade.parentTradeId ~= parentId then return {-3, 'CLOSE_PARENT_INVALID'} end
  local openRaw = redis.call('HGET', openKey, parentId)
  if not openRaw then return {-1, 'OPEN_POSITION_INDEX_MISSING'} end
  local openOk, openTrade = pcall(cjson.decode, openRaw)
  if not openOk or type(openTrade) ~= 'table' or openTrade.id ~= parentId or openTrade.status ~= 'PAPER_OPEN' then
    return {-1, 'OPEN_POSITION_INDEX_MALFORMED'}
  end
  local openVenue = openTrade.venue or openTrade.sourceVenue or 'bybit'
  local closeVenue = trade.venue or trade.sourceVenue or 'bybit'
  local sideMatches = (openTrade.side == 'BUY' and trade.side == 'SELL') or (openTrade.side == 'SELL' and trade.side == 'BUY')
  if openTrade.symbol ~= trade.symbol or openVenue ~= closeVenue or not sideMatches or tonumber(openTrade.quantity) ~= tonumber(trade.quantity) then
    return {-1, 'OPEN_POSITION_INDEX_MISMATCH'}
  end
else
  return {-3, 'ACTION_INVALID'}
end

-- No writes occur until every precondition above has passed.
redis.call('LPUSH', ledgerKey, tradeJson)
if action == 'OPEN' then
  redis.call('HSET', openKey, tradeId, tradeJson)
else
  redis.call('HDEL', openKey, parentId)
  redis.call('HDEL', cursorKey, parentId)
end
redis.call('LTRIM', ledgerKey, 0, retention - 1)
local requestRecord = cjson.encode({action = action, trade = trade})
redis.call('SET', requestKey, requestRecord, 'EX', 7776000)
return {1, requestRecord}
`;

function decodeRecord(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

export async function persistPaperTrade(redis, { requestId, action, trade, parentTradeId = "" }) {
  const id = String(requestId || "").trim();
  const operation = String(action || "").toUpperCase();
  if (!/^[A-Za-z0-9._:-]{16,100}$/.test(id)) throw new Error("A valid paper requestId is required.");
  if (!["OPEN", "CLOSE"].includes(operation)) throw new Error("Paper persistence only supports OPEN or CLOSE.");
  if (!trade || typeof trade !== "object" || !trade.id) throw new Error("A valid paper trade record is required.");
  const durableTrade = { ...trade, requestId: id };
  const requestKey = "tarotai:paper:request:" + id;
  const result = await redis.eval(
    PAPER_LEDGER_PERSIST_LUA,
    [requestKey, "tarotai:paper:ledger", "tarotai:paper:open_positions", "tarotai:paper:stop_cursors"],
    [id, operation, JSON.stringify(durableTrade), String(durableTrade.id), String(parentTradeId || ""), "1000"]
  );
  if (!Array.isArray(result) || result.length < 2) throw new Error("Paper persistence returned an invalid transaction result.");
  const code = Number(result[0]);
  if (code === -1) return { ok: false, reason: String(result[1] || "OPEN_POSITION_INDEX_MISSING") };
  if (code === -2) return { ok: false, reason: "idempotency-conflict", storedRecord: decodeRecord(result[1]) };
  if (code === -3) throw new Error("Paper persistence rejected the transaction: " + String(result[1] || "INVALID_RECORD"));
  if (code !== 0 && code !== 1) throw new Error("Paper persistence returned an unknown transaction status.");
  const record = decodeRecord(result[1]);
  if (!record || record.action !== operation || !record.trade || typeof record.trade !== "object") {
    throw new Error("Paper persistence returned a malformed committed record.");
  }
  return { ok: true, duplicate: code === 0, action: record.action, trade: record.trade };
}

export function readPaperRequestRecord(raw) {
  if (raw === null || raw === undefined) return null;
  const record = decodeRecord(raw);
  if (!record || !["OPEN", "CLOSE"].includes(record.action) || !record.trade || typeof record.trade !== "object") {
    throw new Error("Stored paper request record is malformed.");
  }
  return record;
}
