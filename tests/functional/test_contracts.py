"""TC-C 系列：共享数据契约（DesignSpec / ModelAdjustment / PrintProfile / DomainError）。

覆盖输入自愈、白名单投影、边界钳制、枚举纠偏与密钥无关的纯校验逻辑。
"""

import math

import pytest
from pydantic import ValidationError

from yaha.contracts import DesignSpec, DomainError, Mode, ModelAdjustment, PrintProfile


class TestDesignSpecDefaults:
    def test_tc_c_001_default_spec(self):
        """TC-C-001 默认契约：schema v5、text 模式、默认尺寸与模板。"""
        spec = DesignSpec()
        assert spec.schema_version == 5
        assert spec.mode is Mode.TEXT
        assert spec.provider == "local"
        assert spec.template == "usagi"
        assert (spec.height_mm, spec.width_mm, spec.depth_mm) == (80, 48, 36)
        assert (spec.thickness_mm, spec.bottom_mm, spec.ear_scale) == (3, 4, 1.2)
        assert spec.base is False and spec.hole is False
        assert spec.hole_shape == "round" and spec.relief_kind == "relief"
        assert spec.photo_policy == "auto"
        assert spec.asset_ids == [] and spec.assumptions == []
        assert spec.modeling_plan is None and spec.reconstruction_plan is None

    def test_tc_c_002_unknown_fields_are_projected_away(self):
        """TC-C-002 白名单投影：未知字段被静默丢弃，不触发 extra_forbidden。"""
        spec = DesignSpec.model_validate(
            {"height_mm": 60, "evil_script": "rm -rf", "mode": "TEXT", "__proto__": "x"}
        )
        assert spec.height_mm == 60
        assert "evil_script" not in spec.model_dump()
        assert "evil_script" not in spec.model_fields

    def test_tc_c_003_invalid_mode_falls_back_to_text(self):
        """TC-C-003 非法 mode 自愈为 TEXT，大小写与空白容忍。"""
        assert DesignSpec.model_validate({"mode": "RELIEF"}).mode is Mode.RELIEF
        assert DesignSpec.model_validate({"mode": " text "}).mode is Mode.TEXT
        assert DesignSpec.model_validate({"mode": "hack"}).mode is Mode.TEXT

    def test_tc_c_004_reconstruction_provider_requires_photo_modes(self):
        """TC-C-004 非 图片/多视图 模式下 reconstruction 供应商被降级为 parametric。"""
        healed = DesignSpec.model_validate({"mode": "text", "provider": "reconstruction"})
        assert healed.provider == "parametric"
        kept = DesignSpec.model_validate({"mode": "image", "provider": "reconstruction"})
        assert kept.provider == "reconstruction"

    def test_tc_c_005_invalid_provider_falls_back_to_parametric(self):
        """TC-C-005 非法 provider 自愈为 parametric。"""
        assert DesignSpec.model_validate({"provider": "cloud"}).provider == "parametric"

    def test_tc_c_006_enum_self_healing(self):
        """TC-C-006 photo_policy / hole_shape / relief_kind 非法值回退默认。"""
        spec = DesignSpec.model_validate(
            {"photo_policy": "magic", "hole_shape": "star", "relief_kind": "pop"}
        )
        assert spec.photo_policy == "auto"
        assert spec.hole_shape == "round"
        assert spec.relief_kind == "relief"
        ok = DesignSpec.model_validate(
            {"photo_policy": "SURFACE", "hole_shape": "Heart", "relief_kind": "Lithophane"}
        )
        assert ok.photo_policy == "surface"
        assert ok.hole_shape == "heart"
        assert ok.relief_kind == "lithophane"

    def test_tc_c_007_boolean_coercion(self):
        """TC-C-007 base/hole 接受任意真值并转成严格布尔。"""
        spec = DesignSpec.model_validate({"base": 1, "hole": ""})
        assert spec.base is True and spec.hole is False


class TestDesignSpecBoundaries:
    def test_tc_c_008_dimension_clamping(self):
        """TC-C-008 尺寸钳制：超界收拢到上下界，非数值回退默认。"""
        spec = DesignSpec.model_validate(
            {"height_mm": 9999, "width_mm": -5, "depth_mm": "abc", "thickness_mm": 99, "bottom_mm": 0.1, "ear_scale": 5}
        )
        assert spec.height_mm == 500.0
        assert spec.width_mm == 0.8
        assert spec.depth_mm == 36.0  # 默认
        assert spec.thickness_mm == 20.0
        assert spec.bottom_mm == 0.8
        assert spec.ear_scale == 2.0

    def test_tc_c_009_nan_becomes_upper_bound(self):
        """TC-C-009【已知怪异行为】NaN 尺寸经 min/max 钳制后变成上界而非默认值。

        float('nan') 参与比较恒为 False，min(500, nan) 保留 500，
        因此 height_mm=NaN 会静默变成 500mm 而不是默认 80mm。
        此用例固化当前行为；若产品期望回退默认值则属于缺陷。
        """
        spec = DesignSpec.model_validate({"height_mm": float("nan")})
        assert spec.height_mm == 500.0

    def test_tc_c_010_prompt_truncation(self):
        """TC-C-010 prompt 超长截断到 3000 字符。"""
        spec = DesignSpec.model_validate({"prompt": "哈" * 4000})
        assert len(spec.prompt) == 3000

    def test_tc_c_011_template_normalization(self):
        """TC-C-011 空模板回退 usagi，超长模板截断 50 字符。"""
        assert DesignSpec.model_validate({"template": ""}).template == "usagi"
        assert len(DesignSpec.model_validate({"template": "长" * 99}).template) == 50

    def test_tc_c_012_asset_ids_sanitized(self):
        """TC-C-012 asset_ids 只保留字符串/整数并截断到 96 个。"""
        spec = DesignSpec.model_validate(
            {"asset_ids": ["a", 3, None, {"x": 1}] + ["b"] * 100}
        )
        assert spec.asset_ids[0] == "a" and "3" in spec.asset_ids
        assert None not in spec.asset_ids
        assert len(spec.asset_ids) == 96

    def test_tc_c_013_schema_version_forced_to_5(self):
        """TC-C-013 旧 schema 版本输入统一升迁到 5。"""
        spec = DesignSpec.model_validate({"schema_version": 1})
        assert spec.schema_version == 5


class TestModelAdjustment:
    def test_tc_c_014_instruction_required(self):
        """TC-C-014 微调指令必填且 1..2000 字符。"""
        with pytest.raises(ValidationError):
            ModelAdjustment(instruction="")
        with pytest.raises(ValidationError):
            ModelAdjustment(instruction="好" * 2001)
        ok = ModelAdjustment(instruction=" 把耳朵放大 ")
        assert ok.instruction == "把耳朵放大"  # str_strip_whitespace
        assert ok.schema_version == 1

    def test_tc_c_015_location_point_requires_asset(self):
        """TC-C-015 截图位置标记必须绑定截图素材。"""
        with pytest.raises(ValidationError, match="截图位置标记必须绑定截图素材"):
            ModelAdjustment(instruction="改这里", location_point=(10, 20))
        ok = ModelAdjustment(
            instruction="改这里", location_asset_id="a" * 10, location_point=(0, 100)
        )
        assert ok.location_point == (0.0, 100.0)

    def test_tc_c_016_target_part_id_pattern(self):
        """TC-C-016 部件标识必须以字母开头，仅字母数字下划线，<=48 位。"""
        assert ModelAdjustment(instruction="x", target_part_id="ear_left").target_part_id == "ear_left"
        for bad in ("9ear", "has space", "中文", "a" * 49):
            with pytest.raises(ValidationError):
                ModelAdjustment(instruction="x", target_part_id=bad)

    def test_tc_c_017_location_point_bounds(self):
        """TC-C-017 归一化坐标 0..100，毫米坐标 -2000..2000。"""
        with pytest.raises(ValidationError):
            ModelAdjustment(instruction="x", location_asset_id="a", location_point=(101, 0))
        with pytest.raises(ValidationError):
            ModelAdjustment(instruction="x", location_point_mm=(0, 0, 2001))
        ok = ModelAdjustment(instruction="x", location_point_mm=(-2000, 2000, 0))
        assert ok.location_point_mm == (-2000.0, 2000.0, 0.0)

    def test_tc_c_018_extra_field_rejected(self):
        """TC-C-018 微调契约没有自愈白名单，未知字段直接拒绝。"""
        with pytest.raises(ValidationError):
            ModelAdjustment.model_validate({"instruction": "x", "unexpected": 1})


class TestPrintProfile:
    def test_tc_c_019_default_profile(self):
        """TC-C-019 默认打印配置：A1 mini / 0.4 喷嘴 / 0.2 层高 / PLA / 5mm 留边。"""
        profile = PrintProfile()
        assert profile.machine == "A1 mini"
        assert profile.nozzle_mm == 0.4
        assert profile.layer_mm == 0.2
        assert profile.material == "PLA"
        assert profile.margin_mm == 5

    def test_tc_c_020_machine_and_material_literals(self):
        """TC-C-020 机型与材料是封闭枚举。"""
        with pytest.raises(ValidationError):
            PrintProfile(machine="X1 Carbon")
        with pytest.raises(ValidationError):
            PrintProfile(material="ABS")

    def test_tc_c_021_nozzle_and_layer_bounds(self):
        """TC-C-021 喷嘴 0.2..1.0，层高 0.06..0.4，留边 0..20。"""
        with pytest.raises(ValidationError):
            PrintProfile(nozzle_mm=0.19)
        with pytest.raises(ValidationError):
            PrintProfile(layer_mm=0.05)
        with pytest.raises(ValidationError):
            PrintProfile(layer_mm=0.5)
        with pytest.raises(ValidationError):
            PrintProfile(margin_mm=-1)
        assert PrintProfile(nozzle_mm=1.0, layer_mm=0.4, margin_mm=20).model_dump()

    def test_tc_c_022_extra_field_rejected(self):
        """TC-C-022 打印配置拒绝未知字段。"""
        with pytest.raises(ValidationError):
            PrintProfile.model_validate({"printer": "a1-mini"})


class TestDomainError:
    def test_tc_c_023_domain_error_code(self):
        """TC-C-023 领域错误携带默认码 INVALID_REQUEST 与自定义码。"""
        assert DomainError("出错了").code == "INVALID_REQUEST"
        assert DomainError("出错了", "JOB_BUSY").code == "JOB_BUSY"

    def test_tc_c_024_mode_enum_values(self):
        """TC-C-024 Mode 枚举序列化值稳定。"""
        assert [m.value for m in Mode] == [
            "text", "silhouette", "relief", "image", "multiview", "import",
        ]
