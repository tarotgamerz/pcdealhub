import unittest

from services.performance_optimizer import OptimizerRequest, _heuristic_issues


class PerformanceOptimizerTests(unittest.TestCase):
    def test_flags_low_fps_and_renderer_error(self):
        payload = OptimizerRequest.model_validate({
            "chart": {
                "renderer_status": "error",
                "error_messages": ["canvas context lost"],
                "visible_candles": 250
            },
            "execution_speeds": {
                "fps": 18,
                "frame_time_ms": 55,
                "websocket_lag_ms": 2300
            }
        })
        issues = _heuristic_issues(payload)
        self.assertTrue(any("renderer reports status=error" in issue for issue in issues))
        self.assertTrue(any("18 FPS" in issue for issue in issues))
        self.assertTrue(any("2 seconds" in issue for issue in issues))

    def test_missing_metrics_does_not_claim_healthy_chart(self):
        payload = OptimizerRequest.model_validate({
            "chart": {"renderer_status": "unknown"},
            "execution_speeds": {}
        })
        issues = _heuristic_issues(payload)
        self.assertTrue(any("does not prove the chart is healthy" in issue for issue in issues))

    def test_rejects_out_of_range_telemetry(self):
        with self.assertRaises(ValueError):
            OptimizerRequest.model_validate({
                "chart": {"renderer_status": "ok"},
                "execution_speeds": {"fps": -1}
            })


if __name__ == "__main__":
    unittest.main()
