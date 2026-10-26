# MW Components 工程查询中心

项目包含标准品查询、技术参数大辞典和 MW 产品分类表。纯静态 HTML、CSS、JavaScript 和 JSON，无需 ChatGPT 登录或后端服务。原站点仍可访问：[旧版地址](https://mw-components-standard-parts.jiajieana.chatgpt.site/)；GitHub Pages 需由仓库所有者启用后才会产生新网址。

## 发布到 GitHub Pages

1. 在 GitHub 新建**公开**仓库，建议名称 `mw-components-site`。免费 GitHub Pages 面向公众发布时使用公开仓库；请先确认价格资料适合公开。
2. 将本项目解压后的**全部文件和文件夹**上传到仓库根目录，确保 `.github/workflows/pages.yml`、`dist/index.html` 和 `dist/century-compression.json` 等文件都在。不要只上传 ZIP 文件。默认分支命名为 `main`。
3. 打开仓库 `Settings → Pages → Build and deployment → Source`，选择 `GitHub Actions`。
4. 在 `Actions` 中确认 `Deploy GitHub Pages` 工作流成功；随后在 `Settings → Pages` 找到实际网址。若用户名为 `jiajieana-cell` 且仓库名为 `mw-components-site`，预期网址为 `https://jiajieana-cell.github.io/mw-components-site/`。

后续可在 VS Code 或其他编辑器中修改 `dist/` 下的页面、样式、脚本和数据，再提交到 `main` 分支；工作流会自动更新网站。网站使用相对资源路径，支持 GitHub Pages 的 `/仓库名/` 子路径。`.openai/hosting.json` 只供原 Sites 托管使用，GitHub Pages 不依赖它。

## 标准品数据

- `dist/parts.json`：MW Components 现有品牌的基础型号及来源清单。
- `dist/century-compression.json`：Century Spring 官方目录中的标准压缩弹簧。
- `dist/century-extension.json`：Century Spring 官方目录中的标准拉伸弹簧。
- `dist/commerce.json`：可核实的价格或询价状态。

每条记录含品牌、类别、型号、原始单位、公制检索值和官方来源。页面支持填写一项或多项参数，并按所选最大偏差筛选。所有已填写参数均须满足条件；未公开的参数不会被推断。Engineered Spring Products 官网仅公开按图定制能力，未提供可核实的标准型号表，因此该品牌在页面中单独说明，不计入型号数量。

## 本地预览

这是无需构建步骤的静态网站。在 `dist/` 目录启动任意静态 HTTP 服务，打开其首页即可预览。直接以 `file://` 打开可能无法加载 JSON 数据。

## 更新 Century Spring 数据

下载 [Century Spring 官方目录 PDF](https://info.centuryspring.com/hubfs/MWC%20Catalogs/CenturySpring_2021_Catalog.pdf) 到项目根目录，命名为 `century-catalog.pdf`，安装 `pypdf` 后运行 `python tools/import_century.py`。导入程序会对尺寸的英制、公制换算进行交叉校验，并输出分包数据文件。PDF 已加入 `.gitignore`，不会上传到仓库。

官网目录与价格可能变动；采购前请点击每个型号的来源链接再次核实。项目代码与目录数据不代表制造商官方授权网站。
