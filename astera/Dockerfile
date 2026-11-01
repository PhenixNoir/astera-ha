# Home Assistant bu dosyadan imajı Pi'nin kendisinde kurar (dışarıdan hazır imaj indirilmez).
FROM python:3.12-alpine

# smbclient: Windows'ta paylaşılan etiket yazıcısına basmak için; tzdata: saatler Türkiye saatiyle
RUN apk add --no-cache samba-client tzdata

ENV TZ=Europe/Istanbul \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ATOLYE_HA=1 \
    ATOLYE_DATA_DIR=/config

COPY app /app
WORKDIR /app
CMD ["python3", "-u", "server.py"]
