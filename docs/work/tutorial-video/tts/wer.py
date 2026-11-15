"""Word error rate of a spoken sample against its text (faster-whisper), for choosing narration voices.
   python -I tts/wer.py <audio file> <language code> <text file>   -> one JSON line
"""
import json
import re
import sys

audio, lang, text_file = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(text_file, encoding="utf-8").read()


def words(s):
    return re.findall(r"[\w']+", s.casefold())


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hw in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw))
        prev = cur
    return prev[-1] / max(1, len(r))


from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, language=lang, beam_size=5)
heard = " ".join(s.text.strip() for s in segments)
print(json.dumps({"wer": round(wer(text, heard), 3), "heard": heard[:160]}, ensure_ascii=False))
