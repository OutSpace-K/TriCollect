"""Reproduce the original short UI sound. No third-party samples."""
import wave
import math
import struct
with wave.open('assets/tap.wav', 'w') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(22050)
    output.writeframes(b''.join(struct.pack('<h', int(3500 * math.sin(2 * math.pi * 650 * i / 22050) * math.exp(-i / 550))) for i in range(3308)))
