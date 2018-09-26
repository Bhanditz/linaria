const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const loaderUtils = require('loader-utils');
const babel = require('@babel/core');
const { SourceMapGenerator } = require('source-map');
const slugify = require('./slugify');

module.exports = function loader(content, inputMap) {
  const { sourceMap, ...rest } = loaderUtils.getOptions(this) || {};

  // We do this to get the parser options
  // When transpiling, we don't wanna run all the plugins,
  // but we want to enable the syntaxes used
  // This is especially useful in case of ambiguous syntaxes such as typescript and flow
  const file = new babel.File(
    {
      filename: this.resourcePath,
      sourceMaps: true,
    },
    {
      code: content,
      inputMap,
    }
  );

  const { metadata } = babel.transformFromAstSync(
    file.parse(content),
    content,
    {
      filename: this.resourcePath,
      sourceMaps: true,
      inputSourceMap: inputMap,
      presets: [[require.resolve('../../babel.js'), rest]],
      parserOpts: file.parserOpts,
      babelrc: false,
    }
  );

  const { cssText, dependencies, mappings } = metadata.linaria || {};

  if (cssText) {
    let result = cssText;

    const slug = slugify(this.resourcePath);
    const filename = `${path
      .basename(this.resourcePath)
      .replace(/\.js$/, '')}_${slug}.css`;

    if (sourceMap && mappings && mappings.length) {
      const generator = new SourceMapGenerator({
        file: filename.replace(/\.js$/, '.css'),
      });

      mappings.forEach(mapping =>
        generator.addMapping(Object.assign(mapping, { source: filename }))
      );

      generator.setSourceContent(
        this.resourcePath,
        // We need to get the original source before it was processed
        this.fs.readFileSync(this.resourcePath).toString()
      );

      result += `/*# sourceMappingURL=data:application/json;base64,${Buffer.from(
        generator.toString()
      ).toString('base64')}*/`;
    }

    if (dependencies && dependencies.length) {
      dependencies.forEach(dep => {
        try {
          const f = Module._resolveFilename(dep, {
            id: this.resourcePath,
            filename: this.resourcePath,
            paths: Module._nodeModulePaths(path.dirname(this.resourcePath)),
          });

          this.addDependency(f);
        } catch (e) {
          // Ignore
        }
      });
    }

    const output = path.join(os.tmpdir(), filename.split(path.sep).join('_'));

    fs.writeFileSync(output, result);

    return `${content}\n\nrequire("${output}")`;
  }

  return content;
};
