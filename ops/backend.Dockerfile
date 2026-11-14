FROM python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS dependencies
COPY ops/requirements.lock /requirements.lock
COPY ops/vendor/ /wheels/
RUN python -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: --require-hashes --find-links=/wheels/ --extra-index-url=https://download.pytorch.org/whl/cpu --prefix=/install -r /requirements.lock

FROM python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp PYTHONPATH=/app/ops:/app OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
RUN groupadd --gid 20011 app && useradd --no-log-init --uid 20011 --gid 20011 --no-create-home --shell /usr/sbin/nologin app
COPY --from=dependencies /install/ /usr/local/
WORKDIR /app
COPY --chown=20011:20011 . /app/
USER 20011:20011
EXPOSE 8020
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8020", "--workers", "1", "--threads", "2", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-"]
