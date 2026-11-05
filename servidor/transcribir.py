# Transcribe una nota de voz en español con faster-whisper, en local y sin costo.
# Uso: py -3.12 transcribir.py <audio>  → imprime el texto (UTF-8).
# El modelo («small», ~480 MB) se descarga la primera vez a la caché de Hugging Face.
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) != 2:
        sys.exit("Uso: transcribir.py <audio>")
    modelo = WhisperModel("small", device="cpu", compute_type="int8")
    segmentos, _ = modelo.transcribe(sys.argv[1], language="es", vad_filter=True, beam_size=5)
    texto = " ".join(s.text.strip() for s in segmentos).strip()
    sys.stdout.buffer.write(texto.encode("utf-8"))


if __name__ == "__main__":
    main()
