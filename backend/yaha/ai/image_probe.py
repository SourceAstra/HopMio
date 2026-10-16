"""生成每次不同的图片识别题，避免把接受图片参数当作真正看懂图片。"""
import base64
import io
import json
import secrets
from PIL import Image, ImageDraw, ImageFont


def challenge():
    answer = {"code": "".join(str(secrets.randbelow(10)) for _ in range(6)),
              "shape": secrets.choice(["circle", "square"]),
              "color": secrets.choice(["red", "blue", "green"])}
    image = Image.new("RGB", (600, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.text((28, 75), answer["code"], fill="black", font=ImageFont.load_default(size=64))
    color = {"red": "#e02020", "blue": "#204fe0", "green": "#159830"}[answer["color"]]
    shape = draw.ellipse if answer["shape"] == "circle" else draw.rectangle
    shape((440, 60, 540, 160), fill=color)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    prompt = ('Read the six-digit code, and identify the colored shape in the attached image. '
              'Return only JSON with string fields "code", "shape" (circle or square), '
              'and "color" (red, blue or green). Keep leading zeroes in code.')
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii"), prompt, answer


def matches(text, expected):
    try:
        value = text.strip()
        if value.startswith("```"):
            value = value.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(value)
        return isinstance(result, dict) and all(str(result.get(key, "")).strip().lower() == value for key, value in expected.items())
    except (ValueError, IndexError, TypeError):
        return False
