// Keeps the v26 interpolation checks: helpers take `t` as a loose (key, options) => string.
import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    strictInterpolationChecks: false;
  }
}
