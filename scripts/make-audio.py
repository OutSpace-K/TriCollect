"""Reproduce the original short UI sound. No third-party samples."""
import wave
import math
import struct
with wave.open('assets/tap.wav', 'w') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(22050)
    output.writeframes(b''.join(struct.pack('<h', int(3500 * math.sin(2 * math.pi * 650 * i / 22050) * math.exp(-i / 550))) for i in range(3308)))

# Original 16-second pentatonic bell/pad loop: no samples, melody or recordings imported.
rate = 22050
seconds = 16
count = rate * seconds
samples = [0.0] * count
notes = [60, 67, 69, 64, 62, 67, 64, 69, 60, 64, 67, 62, 69, 67, 64, 62]
for beat, note in enumerate(notes):
    freq = 440 * 2 ** ((note - 69) / 12)
    for j in range(rate * 3):
        t = j / rate
        env = (1 - math.exp(-t * 35)) * math.exp(-t * 2.1) * min(1, (3-t)*8)
        value = env * (math.sin(2*math.pi*freq*t) + .16*math.sin(2*math.pi*freq*2*t)) * .15
        samples[(beat * rate + j) % count] += value
# Low sustained C/G pad, integer cycles over loop duration, smooth boundary.
for i in range(count):
    t = i / rate
    samples[i] += .025 * math.sin(2*math.pi*130.8125*t) + .018 * math.sin(2*math.pi*196*t)
with wave.open('assets/ambience.wav', 'w') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(b''.join(struct.pack('<h', round(max(-1,min(1,x))*32767)) for x in samples))
print('Original ambience: 16s mono PCM, 22050Hz; peak', round(max(abs(x) for x in samples),4))
