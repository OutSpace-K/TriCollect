"""Reproduce the original short UI sound. No third-party samples."""
import wave
import math
import struct
with wave.open('assets/tap.wav', 'w') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(22050)
    output.writeframes(b''.join(struct.pack('<h', int(3500 * math.sin(2 * math.pi * 650 * i / 22050) * math.exp(-i / 550))) for i in range(3308)))

# Original 32-second puzzle-game cue: 135 BPM, 18 bars, melody/bass/percussion.
# All voices are synthesized; no imported samples or melodies.
# Keep the 32-second musical grid; final note release wraps to the first samples.
import random
import json
rate = 22050
seconds = 32
beat=60/135
bars=18
count = rate * seconds
layers = {name: [0.0]*count for name in ['lead','bass','chords','drums']}
rng = random.Random(1717)
def note(layer, start, midi, duration, amplitude, tone):
    freq=440*2**((midi-69)/12)
    for j in range(int(duration*rate)):
        t=j/rate
        env=min(1,t/.008)*math.exp(-t*(5 if tone=='lead' else 3))*min(1,(duration-t)/.035)
        voice=math.sin(2*math.pi*freq*t)+(.28 if tone=='lead' else .12)*math.sin(4*math.pi*freq*t)+(.08 if tone=='lead' else 0)*math.sin(6*math.pi*freq*t)
        layers[layer][(round(start*rate)+j)%count]+=voice*env*amplitude
# Four distinct 2-bar motifs, transposed/answered over a C-Am-F-G progression.
phrases=[[72,76,79,76,74,72,67,74],[76,79,81,79,76,74,72,67],[77,81,79,76,74,77,76,72],[74,79,83,81,79,76,74,72]]
roots=[48,45,41,43]
for bar in range(bars):
    root=roots[(bar//2)%4]
    phrase=phrases[(bar//2)%4]
    for k in range(4):
        pitch=phrase[(bar%2)*4+k]+(12 if bar>=12 and k==3 else 0)
        # The old final note ended 44ms before EOF. Carry its release into the
        # next cycle using note()'s modulo write, rather than trimming the beat
        # or fading both ends to silence. This keeps 135 BPM and exactly 32s.
        duration = beat*1.18 if bar == bars-1 and k == 3 else beat*.9
        note('lead',bar*4*beat+k*beat,pitch,duration,.19 if k%2==0 else .15,'lead')
        if bar%2==1 and k==1:note('lead',bar*4*beat+beat*1.5,pitch+2,beat*.42,.10,'lead')
        if bar%4==3 and k==3:note('lead',bar*4*beat+beat*3.5,pitch-2,.23,.11,'lead')
        note('bass',bar*4*beat+k*beat,root+(7 if k==2 else 0),beat*.48,.075,'bass')
    for k in [1,3,5,7]:
        note('lead',bar*4*beat+k*beat/2,phrase[k]+12,beat*.3,.045,'lead')
    for degree in [0,4 if root!=45 else 3,7]:
        note('chords',bar*4*beat+beat*.5,root+12+degree,beat*.6,.035,'bass')
        note('chords',bar*4*beat+beat*2.5,root+12+degree,beat*.6,.035,'bass')
    for k in range(8):
        start=bar*4*beat+k*beat/2
        for j in range(int(rate*.09)):
            t=j/rate
            # Short soft filtered/noise-like shaker, with pitched wood tick on backbeats.
            value=(rng.random()*2-1)*math.exp(-t*65)*.018
            if k in [2,6]:value+=math.sin(2*math.pi*900*t)*math.exp(-t*55)*.038
            layers['drums'][(round(start*rate)+j)%count]+=value*min(1,t/.003)
        if k in [0,4]:
            for j in range(int(rate*.18)):
                t=j/rate
                layers['drums'][(round(start*rate)+j)%count]+=.075*math.sin(2*math.pi*(65*t+3*(1-math.exp(-t*20))))*math.exp(-t*22)*min(1,t/.003)
samples=[sum(layer[i] for layer in layers.values()) for i in range(count)]
peak=max(abs(x) for x in samples)
scale=min(1,.72/peak)
with wave.open('assets/ambience.wav','w') as output:
    output.setnchannels(1);output.setsampwidth(2);output.setframerate(rate)
    output.writeframes(b''.join(struct.pack('<h',round(x*scale*32767)) for x in samples))
report={'durationSeconds':seconds,'bpm':135,'bars':bars,'sampleRate':rate,'peak':peak*scale,'rms':math.sqrt(sum(x*x for x in samples)/count)*scale,'boundaryStep':abs(samples[0]-samples[-1])*scale,'clippedSamples':sum(abs(x*scale)>=1 for x in samples),'layers':{name:{'rms':math.sqrt(sum(x*x for x in data)/count)*scale,'peak':max(abs(x) for x in data)*scale} for name,data in layers.items()},'humanListeningPerformed':False}
from pathlib import Path
Path('evidence/v0.1.26-audio-synthesis.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
