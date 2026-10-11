import sys, json, wave, numpy as np, sherpa_onnx
m, wav, out = sys.argv[1], sys.argv[2], sys.argv[3]
rec = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=f"{m}/encoder.int8.onnx", decoder=f"{m}/decoder.int8.onnx",
    joiner=f"{m}/joiner.int8.onnx", tokens=f"{m}/tokens.txt", model_type="nemo_transducer", num_threads=4)
with wave.open(wav) as w: sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
# chunk ~20s windows on low-energy points to stay within model context
words=[]; chunk=int(sr*20); i=0
while i < len(a):
    j=min(len(a), i+chunk)
    if j<len(a):  # snap end to quietest 50ms in last 3s
        win=int(sr*0.05); seg=a[j-sr*3:j]; e=[np.abs(seg[k:k+win]).mean() for k in range(0,len(seg)-win,win)]
        j = j-sr*3 + int(np.argmin(e))*win + win//2
    s=rec.create_stream(); s.accept_waveform(sr,a[i:j]); rec.decode_stream(s); r=s.result
    off=i/sr; cur=None
    for tok,t in zip(r.tokens, r.timestamps):
        if tok.startswith(" ") or cur is None:
            if cur: words.append(cur)
            cur={"text":tok.strip(),"start":round(off+t,3)}
        else: cur["text"]+=tok
    if cur: words.append(cur)
    i=j
for k,w in enumerate(words):
    w["end"]=round(min(words[k+1]["start"] if k+1<len(words) else len(a)/sr, w["start"]+0.8),3)
json.dump(words,open(out,"w"),ensure_ascii=False,indent=0)
print(" ".join(f'{w["text"]}' for w in words))
