# 合成信号峰峰值计算器

一个无需后端、可直接部署到 GitHub Pages 的静态网页，用于计算：

- 基波 + 1 个谐波
- 基波 + 2 个谐波

合成周期信号的最大值、最小值、峰峰值和有效值，并绘制波形、列出频谱分量。

## 适用表达式

例如：

\[
u(t)=U_1\sin(2\pi\cdot10.5\times10^3t)
+U_3\sin(2\pi\cdot31.5\times10^3t)
+U_4\sin(2\pi\cdot42.0\times10^3t)
\]

在网页中输入：

| 分量 | 频率 | 幅值 | 相位 |
|---|---:|---:|---:|
| 基波 | 10.5 kHz | U1 | 0° |
| 三次谐波 | 31.5 kHz | U3 | 0° |
| 四次谐波 | 42.0 kHz | U4 | 0° |

频谱分量幅值仍分别为 U1、U3、U4；合成波形峰峰值由波形极值决定，通常不能直接用 `2 × (U1 + U3 + U4)` 代替。

## 功能

- 支持 Hz、kHz、MHz
- 支持 µV、mV、V
- 幅值输入可选择“峰值”或“RMS”
- 支持每个分量的初相位
- 自动寻找较短公共周期
- 数值搜索并细化最大值和最小值
- Canvas 绘制合成波形
- 一键复制计算结果
- 响应式布局，手机和电脑均可使用
- 全部计算在浏览器本地进行

## 本地打开

直接双击 `index.html` 即可。

也可以在当前目录启动简单服务器：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000`。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库，例如 `signal-pp-calculator`。
2. 将本项目所有文件上传到仓库的 `main` 分支。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择：
   - Source：`Deploy from a branch`
   - Branch：`main`
   - Folder：`/(root)`
5. 点击 **Save**。
6. 发布后通常可通过以下地址访问：

```text
https://你的GitHub用户名.github.io/signal-pp-calculator/
```

GitHub 官方文档：

- [配置 GitHub Pages 发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages 快速入门](https://docs.github.com/en/pages/quickstart)

## 计算方法说明

网站先根据各频率寻找公共周期，然后在一个公共周期内进行高密度采样，找到最大值和最小值附近的区间，再使用一维数值搜索细化极值。

\[
U_{pp}=\max_t u(t)-\min_t u(t)
\]

如果输入频率不能形成较短的公共周期，网页会改用最低频率的 5 个周期作为观察时间窗，并明确提示此时结果只代表该时间窗。

> 结果为数值近似。正式计量报告或高精度标定时，应结合题目对幅值定义、相位、采样率、带宽和不确定度的具体要求。

## 文件结构

```text
signal-pp-calculator/
├── index.html
├── styles.css
├── app.js
├── .nojekyll
└── README.md
```

## 自定义

- 修改网页标题和说明：编辑 `index.html`
- 修改配色和布局：编辑 `styles.css`
- 修改默认频率和幅值：编辑 `app.js` 顶部的 `defaults`
- 修改采样密度或公共周期限制：编辑 `app.js` 中的 `analyze()` 和 `estimateCommonPeriod()`
