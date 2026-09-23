module.exports = {
  defaultSeverity: 'error',
  extends: ['stylelint-config-standard'],
  rules: {
    'no-duplicate-selectors': null,
    'block-no-empty': null,
    'selector-class-pattern': null,
    'declaration-block-no-redundant-longhand-properties': [true, { ignoreShorthands: ['/flex/'] }],
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
    'no-empty-source': null,
    'font-family-no-missing-generic-family-keyword': [
      true,
      {
        ignoreFontFamilies: ['PingFangSC-Regular', 'PingFangSC-Medium', 't'],
      },
    ],
    'unit-no-unknown': [true, { ignoreUnits: ['rpx'] }],
    'function-url-quotes': null,
    'at-rule-empty-line-before': ['always', { ignore: ['after-comment'] }],
    'no-descending-specificity': null,
    'selector-type-no-unknown': null,
    'color-function-notation': 'legacy',
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    'media-feature-range-notation': null,
    'length-zero-no-unit': null,
    'rule-empty-line-before': null,
    'value-keyword-case': null,
    'property-no-unknown': [true, { checkPrefixed: true }],
    'import-notation': 'string',
    'declaration-property-value-keyword-no-deprecated': null,
    'declaration-property-value-no-unknown': null,
    'property-no-deprecated': null,
    'declaration-block-no-shorthand-property-overrides': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['deep', 'global'],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.html', '**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/*.less'],
      customSyntax: 'postcss-less',
    },
  ],
};
