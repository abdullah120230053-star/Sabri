from pathlib import Path
import math
import subprocess
import tempfile
import wave

import numpy as np

RATE = 22050
SECONDS = 12
root = Path(__file__).resolve().parents[1] / "src" / "renderer" / "assets" / "audio"
root.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(288)
t = np.arange(RATE * SECONDS) / RATE
freq = np.fft.rfftfreq(len(t), 1 / RATE)

def noise(low=40, high=9500, slope=0):
    bins = np.fft.rfft(rng.normal(size=len(t)))
    weight = (1 - np.exp(-np.square(freq / low))) * np.exp(-np.square(freq / high))
    y = np.fft.irfft(bins * weight / np.maximum(1, freq) ** slope)
    return y / max(0.0001, np.std(y))

def pulse(start, width):
    return np.exp(-np.square((t - start) / width))

def chirp(start, width, pitch, glide):
    progress = np.clip((t - start) / width, 0, 1)
    envelope = np.sin(np.pi * progress) ** 2
    return np.sin(2 * np.pi * (pitch * t + glide * np.square(t - start))) * envelope

def pluck(start, note, cutoff=2):
    since = np.maximum(0, t - start)
    envelope = (1 - np.exp(-since * 35)) * np.exp(-since * cutoff)
    hertz = 440 * (2 ** ((note - 69) / 12))
    return envelope * (np.sin(2*np.pi*hertz*since) + .14*np.sin(4*np.pi*hertz*since))

tracks = {}
tracks["rain"] = .42*noise(250,7000,.38) + .12*noise(110,500,.65)
tracks["ocean"] = noise(30,2700,.76) * (.25 + .2 * (np.sin(2*np.pi*t/6)+1)/2)
tracks["fireplace"] = .19*noise(35,950,.7)
for start in rng.uniform(.1,11.9,40):
    tracks["fireplace"] += rng.uniform(.11,.55) * noise(140,5100,.16) * pulse(start,rng.uniform(.008,.04))
tracks["cafe"] = .15*noise(120,2200,.67)*(1+.25*np.sin(2*np.pi*t/4))
for start in rng.uniform(.1,11.9,13):
    tracks["cafe"] += .19*pluck(start, int(rng.integers(83,96)),10)
tracks["birds"] = .19*noise(150,3400,.67)
for start in (1.2,1.49,3.4,3.67,5.92,8.2,8.43,10.3,10.51,10.73):
    tracks["birds"] += .34*chirp(start, .18, int(rng.integers(1450,2580)), -1800)
tracks["whitenoise"] = .39*noise()
tracks["lofi"] = .045*noise(220,4900,.4)
for start, chord in [(0,(48,55,59,64)),(3,(45,52,55,60)),(6,(41,48,52,55)),(9,(43,50,53,57))]:
    for index, note in enumerate(chord):
        tracks["lofi"] += .14*pluck(start+index*.11,note,1.4)
    for beat in range(4):
        tracks["lofi"] += .07*noise(800,5400,.2)*pulse(start+beat*.75+.35,.025)
tracks["lofi"] += .09*pluck(1.5,67)+.10*pluck(4.5,64)+.09*pluck(7.5,69)+.10*pluck(10.5,62)

with tempfile.TemporaryDirectory() as temporary:
    wav_path = Path(temporary) / "track.wav"
    for name,data in tracks.items():
        fade = min(math.ceil(RATE*.075),len(data)//2)
        data[:fade] *= np.linspace(0,1,fade)
        data[-fade:] *= np.linspace(1,0,fade)
        data = np.clip(data*.65/max(.8,np.quantile(np.abs(data),.999)),-1,1)
        with wave.open(str(wav_path),"wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes((data * 32767).astype("<i2").tobytes())
        subprocess.run(["ffmpeg","-v","error","-y","-i",str(wav_path),"-codec:a","libmp3lame","-q:a","5",str(root/(name+".mp3"))],check=True)
