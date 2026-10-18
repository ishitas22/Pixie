"""Local perceptual hashes for screenshot similarity.

Hashes never leave this laptop. A 16x16 difference hash is taken from the
ink bounding box so recompression and a slight crop of empty margins still
match, while a different screenshot does not.
"""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 40_000_000

HASH_SIDE = 16
HASH_HEX_LENGTH = HASH_SIDE * HASH_SIDE // 4
# Near-duplicates measured on this laptop (recompressed JPEG, slight margin
# crop, small resize) stay at or below 10. Different screenshots stay above 60.
SIMILAR_MAX_DISTANCE = 20


def perceptual_hash(data: bytes) -> str:
    """Return a 256-bit difference hash as 64 lowercase hex characters."""
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            turned = ImageOps.exif_transpose(image)
            source = turned if turned is not None else image
            gray = source.convert("L")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("That image could not be hashed.") from exc
    target = _content_box(gray)
    small = target.resize((HASH_SIDE + 1, HASH_SIDE), Image.Resampling.LANCZOS)
    pixels = list(small.get_flattened_data())
    width = HASH_SIDE + 1
    bits = 0
    for row in range(HASH_SIDE):
        offset = row * width
        for col in range(HASH_SIDE):
            bits = (bits << 1) | (1 if pixels[offset + col] > pixels[offset + col + 1] else 0)
    return f"{bits:0{HASH_HEX_LENGTH}x}"


def is_hash(value: object) -> bool:
    return isinstance(value, str) and len(value) == HASH_HEX_LENGTH and all(ch in "0123456789abcdef" for ch in value)


def hamming_distance(left: str, right: str) -> int | None:
    if not is_hash(left) or not is_hash(right):
        return None
    return (int(left, 16) ^ int(right, 16)).bit_count()


def is_similar(left: str, right: str) -> bool:
    distance = hamming_distance(left, right)
    return distance is not None and distance <= SIMILAR_MAX_DISTANCE


def _content_box(gray: Image.Image) -> Image.Image:
    """Crop to the non-background pixels so a slim margin crop stays stable."""
    histogram = gray.histogram()
    total = sum(histogram) or 1
    mean = sum(index * count for index, count in enumerate(histogram)) / total
    if mean >= 128:
        table = [255 if level < 210 else 0 for level in range(256)]
    else:
        table = [255 if level > 45 else 0 for level in range(256)]
    bbox = gray.point(table).getbbox()
    if bbox is None:
        return gray
    return gray.crop(bbox)
