# STARRY LIVE

用 Three.js 搭建的浏览器互动演唱会。舞台根据预先分析的音频能量和起音点改变追光、应援灯和导播镜头。可以打开歌单切歌，拖动自由镜头，或切到波奇视角，从台上看观众席。

[线上同人演出版](https://ai-joye.com/live/) 使用单独的曲目与美术。仓库自带两段合成音乐、几何人物与乐器，克隆后即可离线运行。

## 本地运行

需要 Python 3 和支持 WebGL 2 的浏览器。在仓库根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8000/>，等门票出现后点击「进入现场」。空格播放或暂停，数字 1–4 选择成员应援色，0 恢复自动灯色。手机可直接点选控制栏。

## 更换曲目

1. 把自己有权使用的 MP3 放入 `assets/audio/`，封面放入 `assets/albums/`。
2. 在 `data.js` 的 `SONGS` 数组中填写曲名、音频与封面路径、时长（秒）。曲名会用作特征文件名，请使用普通文件名。可在 `LYRICS` 中按曲目数组下标添加 LRC 文本。
3. 安装 Node.js 与 FFmpeg 后运行 `node tools/analyze.cjs`。工具会重新生成每首曲子的特征 JSON。日常播放直接使用仓库内的预计算结果。

## 代码和素材

`live-app.js` 包含舞台渲染、灯光、导播、音频和交互；`live.css` 与 `index.html` 定义入场页和控制栏。项目源码、自带合成音频与几何图采用 [MIT 许可证](LICENSE)。内置的 Three.js r180 保留其[上游 MIT 许可证](vendor/LICENSE-three.txt)。

《孤独摇滚！》相关名称和角色属于各自权利人。线上演出版使用的商业录音、歌词、官方立绘及宣传片不随仓库分发，项目许可证仅覆盖仓库中相应的代码和演示资源。

## 采集舞台画面

仓库也提供逐帧截图工具。启动本地站点后，在根目录创建一个镜头配置，例如：

```json
[{"name":"stage","song":0,"from":2,"to":4,"mode":"director","shot":"mid"}]
```

保存为 `shots.json` 后运行以下命令。需要 Node.js 22+ 和 Chrome；其他平台可用 `--chrome` 指定浏览器路径。

```sh
node tools/capture.cjs shots.json --base http://127.0.0.1:8000/ --out frames --still
```

去掉 `--still` 即可导出连续 PNG 帧。
