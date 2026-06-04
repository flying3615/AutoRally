const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const channels = 2;
const bitsPerSample = 16;

function envelope(t, duration) {
  const attack = 0.015;
  const release = 0.045;
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function toneAt(time, events) {
  let value = 0;
  for (const event of events) {
    if (time < event.start || time >= event.start + event.duration) continue;
    const local = time - event.start;
    const env = envelope(local, event.duration);
    const vibrato = event.vibrato
      ? Math.sin(2 * Math.PI * event.vibrato.rate * local) * event.vibrato.depth
      : 0;
    const freq = event.endFrequency
      ? event.frequency + (event.endFrequency - event.frequency) * (local / event.duration)
      : event.frequency + vibrato;
    const fundamental = Math.sin(2 * Math.PI * freq * local);
    const overtone = Math.sin(2 * Math.PI * freq * 2 * local) * 0.18;
    value += (fundamental + overtone) * event.gain * env;
  }
  return Math.max(-1, Math.min(1, value));
}

function writeWave(filePath, durationSeconds, events) {
  const totalSamples = Math.ceil(sampleRate * durationSeconds);
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const time = i / sampleRate;
    const sample = Math.round(toneAt(time, events) * 32767);
    const offset = 44 + i * blockAlign;
    buffer.writeInt16LE(sample, offset);
    buffer.writeInt16LE(sample, offset + 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function warningEvents() {
  const events = [];
  const cycle = 1.25;
  for (let start = 0; start < 10; start += cycle) {
    events.push({ start, duration: 0.34, frequency: 740, gain: 0.42, vibrato: { rate: 5, depth: 4 } });
    events.push({ start: start + 0.48, duration: 0.34, frequency: 560, gain: 0.38, vibrato: { rate: 4, depth: 3 } });
  }
  return events;
}

function timeUpEvents() {
  const events = [];
  const cycle = 1.05;
  for (let start = 0; start < 28; start += cycle) {
    events.push({ start, duration: 0.17, frequency: 980, endFrequency: 1180, gain: 0.5 });
    events.push({ start: start + 0.25, duration: 0.17, frequency: 1230, endFrequency: 1460, gain: 0.5 });
    events.push({ start: start + 0.5, duration: 0.22, frequency: 1550, endFrequency: 1850, gain: 0.48 });
  }
  return events;
}

const outputDir = path.join(__dirname, '..', 'src', 'alarm');
fs.mkdirSync(outputDir, { recursive: true });

writeWave(path.join(outputDir, 'time-warning.wav'), 10, warningEvents());
writeWave(path.join(outputDir, 'time-up.wav'), 28, timeUpEvents());

console.log('Generated src/alarm/time-warning.wav (10s)');
console.log('Generated src/alarm/time-up.wav (28s)');
