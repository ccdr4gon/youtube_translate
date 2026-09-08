export function encodeMessage(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > 1024 * 1024) throw new Error('Message too large');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

export function createDecoder(onMessage) {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE();
      if (size === 0 || size > 1024 * 1024) throw new Error('Invalid message size');
      if (buffer.length < size + 4) return;
      const value = JSON.parse(buffer.subarray(4, 4 + size).toString('utf8'));
      buffer = buffer.subarray(4 + size);
      onMessage(value);
    }
  };
}
