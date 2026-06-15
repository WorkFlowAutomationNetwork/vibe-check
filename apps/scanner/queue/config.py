from celery import Celery
from lib.settings import settings

celery_app = Celery(
    "scanner",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["queue.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=3600,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)
