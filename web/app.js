// ============ 本地调试 ============
const TEST_MODE = false; // 设为 true 从 GitHub 远程获取数据，false 使用本地数据
const TEST_DATA_URL = 'https://raw.githubusercontent.com/slepoh/FNStore/refs/heads/main/data/app_details.json';
const TEST_FNPACK_URL = 'https://raw.githubusercontent.com/slepoh/FNStore/refs/heads/main/data/fnpack_details.json';
const TEST_VERSION_URL = 'https://raw.githubusercontent.com/slepoh/FNStore/refs/heads/main/data/version.json';

// GitHub 代理地址列表
const PROXY_OPTIONS = [
    { value: '', label: '无加速' },
    { value: 'https://github.akams.cn/', label: 'github.akams.cn' },
    { value: 'https://gh-proxy.org/', label: 'gh-proxy.org' },
    { value: 'https://ghfast.top/', label: 'ghfast.top' },
    { value: 'custom', label: '自定义' }
];
// ==================================

// 全局变量
let appsData = [];
let filteredApps = [];
let currentCategory = 'all';
let currentSort = 'name';
let githubProxy = ''; // 全局变量存储GitHub代理URL

// 分页相关变量
let currentPage = 1;
let appsPerPage = 12; // 默认值，之后会根据屏幕大小动态调整

// DOM元素引用
const paginationEl = document.getElementById('pagination');
const appList = document.getElementById('app-list');
const appDetail = document.getElementById('app-detail');
const appDetailContent = document.getElementById('app-detail-content');
const backBtn = document.getElementById('back-btn');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const categoryList = document.getElementById('category-list');
const sortSelect = document.getElementById('sort-select');
const submitAppBtn = document.getElementById('submit-app-btn');
const submitModal = document.getElementById('submit-modal');
const closeModal = document.querySelector('.miuix-modal-close');
const proxySelect = document.getElementById('proxy-select');
const customProxyContainer = document.getElementById('custom-proxy-container');
const customProxyInput = document.getElementById('custom-proxy-input');
const appCountEl = document.getElementById('app-count');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.miuix-sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarElement = document.querySelector('.miuix-sidebar');
const mobileSidebarCards = document.querySelector('.mobile-sidebar-cards');

// Bing 每日图片 API
const BING_API = 'https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN';

// 安全 HTML 标签白名单
const ALLOWED_TAGS = [
    'b', 'i', 'strong', 'em', 'br', 'a', 'p', 'ul', 'ol', 'li',
    'code', 'pre', 'span', 'div', 'blockquote', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'sub', 'sup', 'mark'
];
const ALLOWED_ATTRS = {
    'a': ['href', 'target', 'rel'],
    'span': ['class', 'style'],
    'div': ['class', 'style'],
    'p': ['class', 'style'],
    'code': ['class'],
    'pre': ['class'],
    'blockquote': ['class', 'style'],
    'h1': ['class', 'style'],
    'h2': ['class', 'style'],
    'h3': ['class', 'style'],
    'h4': ['class', 'style'],
    'h5': ['class', 'style'],
    'h6': ['class', 'style']
};

const ALLOWED_STYLES = [
    'color', 'background-color', 'font-size', 'font-weight', 'font-style',
    'text-align', 'text-decoration', 'line-height', 'margin', 'padding',
    'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border', 'border-radius', 'opacity'
];

/**
 * 工具函数：防抖
 * 限制函数在短时间内多次触发，优化搜索性能
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * 过滤 style 属性，只保留安全的 CSS 属性
 */
function sanitizeStyle(styleString) {
    if (!styleString) return '';

    const safeStyles = [];
    const styles = styleString.split(';');

    for (const style of styles) {
        const [prop, value] = style.split(':').map(s => s.trim().toLowerCase());
        if (prop && value && ALLOWED_STYLES.includes(prop)) {
            // 检查值中是否包含危险内容
            if (!value.includes('url(') &&
                !value.includes('expression(') &&
                !value.includes('javascript:')) {
                safeStyles.push(`${prop}: ${value}`);
            }
        }
    }

    return safeStyles.join('; ');
}

/**
 * 安全的 HTML 过滤函数
 * 防止 XSS 攻击
 */
function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    function cleanNode(node) {
        const childNodes = Array.from(node.childNodes);

        for (const child of childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                continue;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();

                if (!ALLOWED_TAGS.includes(tagName)) {
                    const textNode = document.createTextNode(child.textContent);
                    node.replaceChild(textNode, child);
                } else {
                    const allowedAttrs = ALLOWED_ATTRS[tagName] || [];
                    const attrs = Array.from(child.attributes);

                    for (const attr of attrs) {
                        if (!allowedAttrs.includes(attr.name)) {
                            child.removeAttribute(attr.name);
                        } else if (attr.name === 'href') {
                            const href = attr.value.toLowerCase().trim();
                            if (!href.startsWith('http://') &&
                                !href.startsWith('https://') &&
                                !href.startsWith('mailto:')) {
                                child.removeAttribute('href');
                            }
                        } else if (attr.name === 'style') {
                            const safeStyle = sanitizeStyle(attr.value);
                            if (safeStyle) {
                                child.setAttribute('style', safeStyle);
                            } else {
                                child.removeAttribute('style');
                            }
                        }
                    }

                    if (tagName === 'a') {
                        child.setAttribute('target', '_blank');
                        child.setAttribute('rel', 'noopener noreferrer');
                    }

                    cleanNode(child);
                }
            } else {
                node.removeChild(child);
            }
        }
    }

    cleanNode(tempDiv);
    return tempDiv.innerHTML;
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    loadProxySetting();
    loadBingBackground();
    updatePageSize(); // 初始化页面大小
    loadAppsData();
    setupEventListeners();

    // 监听窗口大小变化
    window.addEventListener('resize', debounce(() => {
        if (window.innerWidth > 767 && sidebarElement) {
            // 在平板以上设备恢复默认状态
            sidebarElement.classList.remove('expanded');
            if (sidebarToggleBtn) {
                sidebarToggleBtn.classList.remove('active');
            }
            document.body.style.overflow = '';
        }
        
        const oldSize = appsPerPage;
        updatePageSize();
        if (oldSize !== appsPerPage) {
            currentPage = 1; // 页面大小改变时重置页码，防止索引越界
            renderAppList();
        }
    }, 200));
});

// 计算合适的每页显示数量
function updatePageSize() {
    const container = document.getElementById('app-list');
    if (!container) return;

    const width = window.innerWidth;
    const isMobile = width <= 767;
    const sidebarWidth = document.documentElement.classList.contains('sidebar-collapsed') ? 0 : 280;
    const availableWidth = width - (sidebarWidth || 0) - 48; // 减去内边距

    // 根据不同屏幕尺寸设置合适的页面大小
    if (width >= 1920) {
        // 大屏幕：3-4行
        const columns = Math.max(1, Math.floor((availableWidth + 24) / (340 + 24)));
        appsPerPage = columns * 4;
    } else if (width >= 1200) {
        // 中等屏幕：3行
        const columns = Math.max(1, Math.floor((availableWidth + 24) / (320 + 24)));
        appsPerPage = columns * 3;
    } else if (width >= 768) {
        // 平板：4行
        const columns = Math.max(1, Math.floor((availableWidth + 20) / (280 + 20)));
        appsPerPage = columns * 4;
    } else {
        // 手机：考虑侧边栏展开状态
        if (sidebarElement && sidebarElement.classList.contains('expanded')) {
            // 侧边栏展开时，显示更少的应用
            appsPerPage = 4;
        } else {
            // 侧边栏收起时，正常显示
            appsPerPage = 6;
        }
    }

    // 确保最小和最大值
    appsPerPage = Math.max(4, Math.min(appsPerPage, 24));

    console.log(`[Layout] Width: ${width}, PageSize: ${appsPerPage}, Mobile: ${isMobile}`);
}

// 加载 Bing 每日背景图片
async function loadBingBackground() {
    try {
        const cached = localStorage.getItem('bingBackground');
        const cachedDate = localStorage.getItem('bingBackgroundDate');
        const today = new Date().toDateString();

        if (cached && cachedDate === today) {
            document.body.style.backgroundImage = `url(${cached})`;
            return;
        }

        const response = await fetch(BING_API);
        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                document.body.style.backgroundImage = `url(${data.url})`;
                localStorage.setItem('bingBackground', data.url);
                localStorage.setItem('bingBackgroundDate', today);
            }
        }
    } catch (error) {
        console.warn('加载 Bing 背景图片失败:', error);
    }
}

// 设置事件监听器
function setupEventListeners() {
    backBtn.addEventListener('click', showAppList);
    searchBtn.addEventListener('click', handleSearch);

    // 优化：使用防抖处理搜索输入，延迟 300ms 执行
    searchInput.addEventListener('input', debounce(() => {
        handleSearch();
    }, 300));

    // 保留回车立即搜索
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    sortSelect.addEventListener('change', handleSort);
    submitAppBtn.addEventListener('click', () => {
        submitModal.classList.remove('hidden');
    });
    closeModal.addEventListener('click', () => {
        submitModal.classList.add('hidden');
    });

    // 汉堡菜单切换侧边栏
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        document.documentElement.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));

        // 侧边栏切换也会影响内容宽度，触发页面大小重新计算
        setTimeout(() => {
            const oldSize = appsPerPage;
            updatePageSize();
            if (oldSize !== appsPerPage) {
                currentPage = 1;
                renderAppList();
            }
        }, 350); // 等待过渡动画完成
    });

    if (document.documentElement.classList.contains('sidebar-collapsed')) {
        sidebar.classList.add('collapsed');
    }

    // 代理设置相关
    proxySelect.addEventListener('change', handleProxyChange);
    customProxyInput.addEventListener('blur', handleCustomProxyChange);
    customProxyInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleCustomProxyChange();
    });

    submitModal.addEventListener('click', (e) => {
        if (e.target === submitModal) {
            submitModal.classList.add('hidden');
        }
    });

    // 分类点击事件
    categoryList.addEventListener('click', (e) => {
        const listItem = e.target.closest('.miuix-list-item');
        if (listItem) {
            document.querySelectorAll('.miuix-list-item').forEach(item => {
                item.classList.remove('active');
            });
            listItem.classList.add('active');
            currentCategory = listItem.dataset.category;
            filterApps();
            
            // 移动端选择分类后关闭侧边栏
            if (window.innerWidth <= 767) {
                closeMobileSidebar();
            }
        }
    });

    // 优化：事件委托处理应用列表点击
    appList.addEventListener('click', (e) => {
        const card = e.target.closest('.app-card');
        if (card && appList.contains(card)) {
            // 防止点击作者链接时触发卡片点击
            if (e.target.closest('.author-link')) return;

            const appId = card.dataset.appId;
            showAppDetail(appId);
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!submitModal.classList.contains('hidden')) {
                submitModal.classList.add('hidden');
            } else if (!appDetail.classList.contains('hidden')) {
                showAppList();
            } else if (window.innerWidth <= 767 && sidebarElement && sidebarElement.classList.contains('expanded')) {
                closeMobileSidebar();
            }
        }
    });

    // 路由历史处理
    window.addEventListener('popstate', (e) => {
        const params = new URLSearchParams(window.location.search);
        const appId = params.get('q');
        if (appId) {
            showAppDetail(appId, false);
        } else {
            showAppList(false);
        }
    });
    
    // 移动端触摸支持
    let touchStartX = 0;
    let touchStartY = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 0) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        // 水平滑动距离大于垂直滑动距离，且水平滑动距离大于50px
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            // 在屏幕左侧边缘滑动显示/隐藏侧边栏
            if (touchStartX < 50 && deltaX > 0) {
                // 向右滑动，显示侧边栏
                sidebar.classList.remove('collapsed');
                document.documentElement.classList.remove('sidebar-collapsed');
                localStorage.setItem('sidebarCollapsed', 'false');
            } else if (deltaX < 0 && !sidebar.classList.contains('collapsed')) {
                // 向左滑动，隐藏侧边栏
                sidebar.classList.add('collapsed');
                document.documentElement.classList.add('sidebar-collapsed');
                localStorage.setItem('sidebarCollapsed', 'true');
            }
        }
    });
    
    // 点击模态框外部关闭
    submitModal.addEventListener('click', (e) => {
        if (e.target === submitModal) {
            submitModal.classList.add('hidden');
        }
    });
    
    // 移动端点击应用详情外部返回列表
    appDetail.addEventListener('click', (e) => {
        if (e.target === appDetail && window.innerWidth < 768) {
            showAppList();
        }
    });

    // 移动端侧边栏切换
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleMobileSidebar);
    }
    
    // 点击侧边栏外部关闭侧边栏
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 767 && 
            sidebarElement && 
            sidebarElement.classList.contains('expanded') &&
            !sidebarElement.contains(e.target) &&
            e.target !== sidebarToggleBtn) {
            closeMobileSidebar();
        }
    });

    // 排序选择变化时，移动端关闭侧边栏
    sortSelect.addEventListener('change', () => {
        handleSort();
        if (window.innerWidth <= 767) {
            closeMobileSidebar();
        }
    });
}

// 切换移动端侧边栏
function toggleMobileSidebar() {
    if (!sidebarElement || !sidebarToggleBtn) return;
    
    sidebarElement.classList.toggle('expanded');
    sidebarToggleBtn.classList.toggle('active');
    
    // 如果展开，添加滚动锁定
    if (sidebarElement.classList.contains('expanded')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// 关闭移动端侧边栏
function closeMobileSidebar() {
    if (!sidebarElement || !sidebarToggleBtn) return;
    
    sidebarElement.classList.remove('expanded');
    sidebarToggleBtn.classList.remove('active');
    document.body.style.overflow = '';
}

// 处理代理设置变化
function handleProxyChange() {
    if (proxySelect.value === 'custom') {
        customProxyContainer.classList.remove('hidden');
        const savedCustomProxy = localStorage.getItem('customGithubProxy');
        if (savedCustomProxy) {
            customProxyInput.value = savedCustomProxy;
            githubProxy = savedCustomProxy;
        }
    } else {
        customProxyContainer.classList.add('hidden');
        githubProxy = proxySelect.value;
        localStorage.setItem('githubProxy', githubProxy);
        loadAppsData();
    }
    
    // 移动端选择代理后关闭侧边栏
    if (window.innerWidth <= 767) {
        closeMobileSidebar();
    }
}

// 处理自定义代理变化
function handleCustomProxyChange() {
    let customProxy = customProxyInput.value.trim();
    if (customProxy && !customProxy.startsWith('http://') && !customProxy.startsWith('https://')) {
        alert('请输入有效的URL，必须以 http:// 或 https:// 开头');
        return;
    }
    if (customProxy && !customProxy.endsWith('/')) {
        customProxy += '/';
    }
    githubProxy = customProxy;
    customProxyInput.value = customProxy;
    localStorage.setItem('githubProxy', 'custom');
    localStorage.setItem('customGithubProxy', customProxy);
    loadAppsData();
    
    // 移动端输入完成后关闭侧边栏
    if (window.innerWidth <= 767) {
        closeMobileSidebar();
    }
}

function initProxyOptions() {
    proxySelect.innerHTML = PROXY_OPTIONS.map(option =>
        `<option value="${option.value}">${option.label}</option>`
    ).join('');
}

function loadProxySetting() {
    initProxyOptions();
    const savedProxy = localStorage.getItem('githubProxy');
    if (savedProxy) {
        githubProxy = savedProxy;
        if (savedProxy === 'custom') {
            proxySelect.value = 'custom';
            customProxyContainer.classList.remove('hidden');
            const savedCustomProxy = localStorage.getItem('customGithubProxy');
            if (savedCustomProxy) {
                customProxyInput.value = savedCustomProxy;
                githubProxy = savedCustomProxy;
            }
        } else {
            proxySelect.value = githubProxy;
        }
    }
}

function getProxyUrl(url) {
    if (!githubProxy || !url) return url;
    if (url.includes('github.com') || url.includes('githubusercontent.com')) {
        return githubProxy + url;
    }
    return url;
}

// 提取所有分类
function extractCategories() {
    const categories = new Set(['all']);
    appsData.forEach(app => {
        if (app.category) {
            categories.add(app.category);
        }
    });

    categoryList.innerHTML = '';
    categories.forEach(category => {
        const li = document.createElement('li');
        li.className = 'miuix-list-item';
        li.dataset.category = category;

        const span = document.createElement('span');
        span.className = 'miuix-list-item-text';
        span.textContent = category === 'all' ? '全部' : getCategoryDisplayName(category);

        li.appendChild(span);
        if (category === currentCategory) {
            li.classList.add('active');
        }
        categoryList.appendChild(li);
    });
}

function getCategoryDisplayName(category) {
    const categoryNames = {
        'uncategorized': '未分类',
        'utility': '工具',
        'media': '媒体',
        'network': '网络',
        'development': '开发',
        'system': '系统',
        'productivity': '效率',
        'games': '游戏'
    };
    return categoryNames[category] || category;
}

// 过滤应用
function filterApps() {
    if (currentCategory === 'all') {
        filteredApps = [...appsData];
    } else {
        filteredApps = appsData.filter(app => app.category === currentCategory);
    }

    const searchTerm = searchInput.value.trim().toLowerCase();
    if (searchTerm) {
        // 模糊搜索算法：检查 query 中的字符是否按顺序出现在 text 中
        const fuzzyMatch = (text, query) => {
            let i = 0, j = 0;
            while (i < text.length && j < query.length) {
                if (text[i] === query[j]) {
                    j++;
                }
                i++;
            }
            return j === query.length;
        };

        filteredApps = filteredApps.filter(app => {
            const name = app.name.toLowerCase();
            const desc = (app.description || '').toLowerCase();
            const author = (app.author || '').toLowerCase();

            // 优先检查精确包含 (性能好)
            if (name.includes(searchTerm) ||
                desc.includes(searchTerm) ||
                author.includes(searchTerm)) {
                return true;
            }

            // 其次使用模糊匹配 (只针对英文应用名/作者名，因为中文模糊匹配无意义且慢)
            // 仅当搜索词不含空格时启用（防止复杂语句误判）
            if (!searchTerm.includes(' ')) {
                if (fuzzyMatch(name, searchTerm) || fuzzyMatch(author, searchTerm)) {
                    return true;
                }
            }

            return false;
        });
    }

    sortApps();
    currentPage = 1; // 重置页码
    renderAppList();
}

function sortApps() {
    switch (currentSort) {
        case 'name':
            filteredApps.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'stars':
            filteredApps.sort((a, b) => (b.stars || 0) - (a.stars || 0));
            break;
        case 'updated':
            filteredApps.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
            break;
    }
}

function handleSearch() {
    filterApps();
    
    // 移动端搜索后关闭侧边栏
    if (window.innerWidth <= 767) {
        closeMobileSidebar();
    }
}

function handleSort() {
    currentSort = sortSelect.value;
    filterApps();
}

// 渲染应用列表
function renderAppList() {
    if (appCountEl) {
        appCountEl.textContent = `共 ${filteredApps.length} 个应用`;
    }

    if (filteredApps.length === 0) {
        appList.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <path d="M8 8l6 6"></path>
                    <path d="M14 8l-6 6"></path>
                </svg>
                <p class="empty-title">没有找到匹配的应用</p>
                <p class="empty-desc">试试其他搜索关键词或分类</p>
            </div>
        `;
        return;
    }

    appList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const startIndex = (currentPage - 1) * appsPerPage;
    const endIndex = startIndex + appsPerPage;
    const pageApps = filteredApps.slice(startIndex, endIndex);

    pageApps.forEach((app, index) => {
        const cardHtml = createAppCard(app);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const cardElement = tempDiv.firstElementChild;

        // 添加渐入动画
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translateY(20px)';
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardElement.style.transitionDelay = `${index * 50}ms`;

        fragment.appendChild(cardElement);
    });

    appList.appendChild(fragment);
    renderPagination();

    requestAnimationFrame(() => {
        document.querySelectorAll('.app-card').forEach(card => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });
    });
}

// 分页功能
function goToPage(page) {
    const totalPages = Math.ceil(filteredApps.length / appsPerPage);
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    if (page === currentPage) return;
    currentPage = page;
    renderAppList();
}

function renderPagination() {
    if (!paginationEl) return;
    const totalPages = Math.ceil(filteredApps.length / appsPerPage);

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let html = '';
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn prev-btn" data-page="${currentPage - 1}" ${prevDisabled}>&laquo;</button>`;

    const appendPageBtn = (page) => {
        const active = page === currentPage ? 'active' : '';
        html += `<button class="page-btn ${active}" data-page="${page}">${page}</button>`;
    };

    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
            appendPageBtn(i);
        }
    } else {
        appendPageBtn(1);
        if (currentPage > 3) {
            html += `<span class="page-ellipsis">...</span>`;
        }
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            appendPageBtn(i);
        }
        if (currentPage < totalPages - 2) {
            html += `<span class="page-ellipsis">...</span>`;
        }
        appendPageBtn(totalPages);
    }

    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn next-btn" data-page="${currentPage + 1}" ${nextDisabled}>&raquo;</button>`;

    paginationEl.innerHTML = html;

    Array.from(paginationEl.querySelectorAll('.page-btn')).forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.getAttribute('data-page'), 10);
            if (!isNaN(page)) {
                goToPage(page);
            }
        });
    });
}

// 显示应用列表（从详情页返回）
function showAppList(updateHistory = true) {
    if (updateHistory) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('q');
        window.history.pushState({}, '', newUrl);
    }

    document.title = '2FStore - FNOS 第三方应用仓库';

    appDetail.style.opacity = '0';

    setTimeout(() => {
        appDetail.classList.add('hidden');
        appList.classList.remove('hidden');

        // 如果当前列表需要分页，恢复显示分页控件
        if (paginationEl && filteredApps.length > appsPerPage) {
            paginationEl.classList.remove('hidden');
        }

        setTimeout(() => {
            appList.style.opacity = '1';
        }, 50);
    }, 200);
}

function getAuthorUrl(app) {
    if (app.author_url) return app.author_url;
    if (app.repository && app.repository.includes('github.com')) {
        const match = app.repository.match(/github\.com\/([^\/]+)/);
        if (match) {
            return `https://github.com/${match[1]}`;
        }
    }
    return null;
}

// 创建应用卡片
function createAppCard(app) {
    const initial = app.name.charAt(0).toUpperCase();
    const iconUrl = app.iconUrl || '';
    let sourceBadge = '';
    if (app.source) {
        sourceBadge = `<span class="app-source-badge store-${app.source.toLowerCase()}">${app.source}</span>`;
    }

    const authorUrl = getAuthorUrl(app);
    const imgErrorHandler = `onerror="this.style.display='none';this.parentElement.querySelector('.img-placeholder').style.display='flex';"`;

    return `
        <div class="miuix-card app-card" data-app-id="${app.id}">
            <div class="app-card-header">
                <div class="app-icon">
                    ${iconUrl ? `<img src="${getProxyUrl(iconUrl)}" alt="${app.name}" loading="lazy" ${imgErrorHandler} style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"><span class="img-placeholder" style="display:none;">${initial}</span>` : initial}
                </div>
                <div class="app-info">
                    <div class="app-name truncate">${app.name}</div>
                    <div class="app-author truncate">${authorUrl ? `<a href="${authorUrl}" target="_blank" class="author-link" onclick="event.stopPropagation()">${app.author}</a>` : `<span>${app.author}</span>`}</div>
                </div>
            </div>
            <div class="app-card-body">
                <div class="app-description clamp-2">${sanitizeHtml(app.description) || '暂无描述'}</div>
                <div class="app-meta">
                    <span>⭐ ${app.stars || 0}</span>
                    <span>🍴 ${app.forks || 0}</span>
                    <span>📦 ${app.version || '1.0.0'}</span>
                    <span>🕐 ${formatDate(app.lastUpdate)}</span>
                    ${sourceBadge}
                </div>
            </div>
        </div>
    `;
}

// 显示应用详情
function showAppDetail(appId, updateHistory = true) {
    // 关闭移动端侧边栏
    if (window.innerWidth <= 767) {
        closeMobileSidebar();
    }
    
    const app = appsData.find(a => a.id === appId);
    if (!app) return;

    if (updateHistory) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('q', appId);
        window.history.pushState({ appId: appId }, '', newUrl);
    }

    document.title = `${app.name} - 2FStore`;

    if (paginationEl) {
        paginationEl.classList.add('hidden');
    }

    const initial = app.name.charAt(0).toUpperCase();
    const iconUrl = app.iconUrl || '';
    let sourceBadge = '';
    if (app.source) {
        sourceBadge = `<span class="app-source-badge store-${app.source.toLowerCase()}">${app.source}</span>`;
    }

    const authorUrl = getAuthorUrl(app);
    const imgErrorHandler = `onerror="this.style.display='none';this.parentElement.querySelector('.img-placeholder').style.display='flex';"`;

    appDetailContent.innerHTML = `
        <div class="app-detail-container">
            <div class="app-detail-header">
                <div class="app-detail-icon">
                    ${iconUrl ? `<img src="${getProxyUrl(iconUrl)}" alt="${app.name}" loading="lazy" ${imgErrorHandler} style="width: 100%; height: 100%; object-fit: cover; border-radius: 16px;"><span class="img-placeholder" style="display:none;">${initial}</span>` : initial}
                </div>
                <div class="app-detail-info">
                    <div class="app-detail-name">${app.name} ${sourceBadge}</div>
                    <div class="app-detail-author">${authorUrl ? `<a href="${authorUrl}" target="_blank" class="author-link">${app.author}</a>` : `<span>${app.author}</span>`}</div>
                    <div class="app-detail-stats">
                        <span>⭐ ${app.stars || 0}</span>
                        <span>🍴 ${app.forks || 0}</span>
                        <span>🏷️ ${getCategoryDisplayName(app.category || 'uncategorized')}</span>
                        <span>📦 ${app.version || '1.0.0'}</span>
                    </div>
                </div>
            </div>
            
            <div class="app-detail-description">
                ${sanitizeHtml(app.description) || '暂无描述'}
            </div>
            
            <div class="app-detail-actions">
                ${app.downloadUrl ? `<a href="${getProxyUrl(app.downloadUrl)}" class="download-btn" download><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>下载应用</a>` : ''}
                <a href="${app.repository}" target="_blank" class="repo-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>查看仓库</a>
            </div>
            
            ${app.screenshots && app.screenshots.length > 0 ? `
                <div class="app-screenshots">
                    <h3>截图</h3>
                    <div class="screenshot-container">
                        ${app.screenshots.map(screenshot => `
                            <img src="${getProxyUrl(screenshot)}" alt="应用截图" loading="lazy" class="screenshot">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="app-last-update">
                最后更新: ${formatDate(app.lastUpdate)}
            </div>
        </div>
    `;

    appList.style.opacity = '0';
    setTimeout(() => {
        appList.classList.add('hidden');
        appDetail.classList.remove('hidden');
        setTimeout(() => {
            appDetail.style.opacity = '1';
        }, 50);
    }, 200);
}

function formatDate(dateString) {
    if (!dateString) return '未知';

    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
        return `${diffDays}天前`;
    } else if (diffDays < 30) {
        return `${Math.floor(diffDays / 7)}周前`;
    } else if (diffDays < 365) {
        return `${Math.floor(diffDays / 30)}个月前`;
    } else {
        return `${Math.floor(diffDays / 365)}年前`;
    }
}

function showError(message) {
    appList.innerHTML = `<div class="miuix-card"><div class="miuix-card-content" style="padding: 32px; text-align: center; font-size: 16px; color: var(--miuix-color-error);">${message}</div></div>`;
}

function showLoading() {
    const skeletonCards = Array(6).fill('').map(() => `
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-icon skeleton-pulse"></div>
                <div class="skeleton-info">
                    <div class="skeleton-title skeleton-pulse"></div>
                    <div class="skeleton-author skeleton-pulse"></div>
                </div>
            </div>
            <div class="skeleton-body">
                <div class="skeleton-desc skeleton-pulse"></div>
                <div class="skeleton-desc skeleton-pulse" style="width: 60%;"></div>
            </div>
        </div>
    `).join('');
    appList.innerHTML = skeletonCards;
}

// 智能缓存：基于版本哈希，只在数据变化时下载
async function fetchWithVersionCheck(url, cacheKey, versionKey, remoteVersion) {
    const cachedData = localStorage.getItem(cacheKey);
    const cachedVersion = localStorage.getItem(`${cacheKey}_version`);

    if (remoteVersion && cachedVersion === remoteVersion && cachedData) {
        console.log(`[Cache] ${cacheKey}: 版本未变化(${remoteVersion})，使用缓存`);
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            // 缓存损坏，继续下载
        }
    }

    try {
        const response = await fetch(url, { cache: 'no-cache' });

        if (response.ok) {
            const data = await response.json();

            // 保存到缓存
            localStorage.setItem(cacheKey, JSON.stringify(data));
            if (remoteVersion) {
                localStorage.setItem(`${cacheKey}_version`, remoteVersion);
            }

            console.log(`[Cache] ${cacheKey}: 已更新缓存，版本: ${remoteVersion || 'unknown'}`);
            return data;
        }

        if (cachedData) {
            console.warn(`请求 ${url} 失败，使用缓存数据`);
            return JSON.parse(cachedData);
        }

        throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        if (cachedData) {
            console.warn(`网络错误，使用缓存数据:`, error);
            return JSON.parse(cachedData);
        }
        throw error;
    }
}

// 获取远程版本信息
async function fetchVersionInfo() {
    const versionUrl = TEST_MODE ? TEST_VERSION_URL : './version.json';
    try {
        const response = await fetch(versionUrl, { cache: 'no-cache' });
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.warn('获取版本信息失败:', error);
    }
    return null;
}

// 加载应用数据
async function loadAppsData() {
    try {
        showLoading();

        const appUrl = TEST_MODE ? TEST_DATA_URL : './app_details.json';
        const fnpackUrl = TEST_MODE ? TEST_FNPACK_URL : './fnpack_details.json';

        if (TEST_MODE) {
            console.log('[Debug] 测试模式已启用，从 GitHub 远程获取数据');
        }

        const versionInfo = await fetchVersionInfo();
        const appVersion = versionInfo?.app_details?.hash;
        const fnpackVersion = versionInfo?.fnpack_details?.hash;

        const [appData, fnpackData] = await Promise.all([
            fetchWithVersionCheck(appUrl, 'appDetailsCache', 'app_details', appVersion),
            fetchWithVersionCheck(fnpackUrl, 'fnpackDetailsCache', 'fnpack_details', fnpackVersion)
        ]);

        const standardApps = (appData.apps || []).map(app => ({ ...app, source: '2FStore' }));
        const fnpackApps = (fnpackData.apps || []).map(app => ({ ...app, source: 'FnDepot' }));

        // 优化：2FStore 优先去重逻辑
        const standardIds = new Set(standardApps.map(a => a.id));
        const standardNames = new Set(standardApps.map(a => a.name));

        const appMap = new Map();

        // 1. 先添加 2FStore 应用
        standardApps.forEach(app => {
            appMap.set(app.id, app);
        });

        // 2. 添加 FnDepot 应用，过滤重复
        fnpackApps.forEach(app => {
            // ID重复
            if (appMap.has(app.id)) return;
            // 名称重复 (优先保留 2FStore)
            if (app.name && standardNames.has(app.name)) return;
            // Key冲突 (如 lunatv 和 yuexps_lunatv 指向同一应用)
            if (app.fnpack_app_key && standardIds.has(app.fnpack_app_key)) return;

            appMap.set(app.id, app);
        });

        appsData = Array.from(appMap.values());

        extractCategories();
        filterApps();

        // 处理初始路由
        const params = new URLSearchParams(window.location.search);
        const appId = params.get('q');
        if (appId) {
            showAppDetail(appId, false);
        }
    } catch (error) {
        console.error('加载应用数据失败:', error);
        showError('加载应用数据失败，请稍后再试。');
    }
}