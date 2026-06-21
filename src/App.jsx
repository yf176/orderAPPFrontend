import { useState, useEffect, useRef, useCallback } from "react";
import { ShoppingCart, Plus, Trash2, LogOut, Package, ClipboardList, X, Check, Clock, KeyRound, Upload, Image as ImageIcon } from "lucide-react";

// ---- IMPORTANT ----
// Set this to your deployed backend URL (Render, etc), e.g. "https://your-app.onrender.com"
// While developing locally, "http://localhost:3001" works.
const API_BASE = "https://YOUR-BACKEND-URL.onrender.com";

async function apiCall(path, { method = "GET", role, body, isFormData } = {}) {
  const headers = {};
  if (role) headers["x-role"] = role;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no body
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `请求失败 (${res.status})`);
  }
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OrderApp() {
  const [role, setRole] = useState(null); // 'admin' | 'client' | null
  const [loginInput, setLoginInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connError, setConnError] = useState("");

  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);

  const [newItemName, setNewItemName] = useState("");
  const [newItemImagePreview, setNewItemImagePreview] = useState("");
  const [newItemImageData, setNewItemImageData] = useState("");
  const fileInputRef = useRef(null);

  const [cart, setCart] = useState({}); // itemId -> qty
  const [adminTab, setAdminTab] = useState("orders"); // 'orders' | 'items' | 'settings' | 'pw'
  const [toast, setToast] = useState("");

  // password change form state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  const refreshData = useCallback(async () => {
    if (!role) return;
    try {
      const [itemsRes, ordersRes] = await Promise.all([
        apiCall("/api/items", { role }),
        apiCall("/api/orders", { role }),
      ]);
      setItems(itemsRes);
      setOrders(ordersRes);
      setConnError("");
    } catch (e) {
      setConnError("无法连接到服务器，请检查后端是否运行中。");
    }
  }, [role]);

  // Initial load + polling every 4s while logged in
  useEffect(() => {
    if (!role) return;
    refreshData();
    const interval = setInterval(refreshData, 4000);
    return () => clearInterval(interval);
  }, [role, refreshData]);

  async function handleLogin(targetRole) {
    setLoginError("");
    setLoading(true);
    try {
      await apiCall("/api/login", { method: "POST", body: { role: targetRole, password: loginInput } });
      setRole(targetRole);
      setLoginInput("");
    } catch (e) {
      setLoginError(e.message || "登录失败");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setRole(null);
    setLoginInput("");
    setLoginError("");
    setCart({});
    setAdminTab("orders");
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwError("");
    setItems([]);
    setOrders([]);
  }

  async function handleImageSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      showToast("图片太大，请选择小于 4MB 的图片");
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setNewItemImageData(base64);
      setNewItemImagePreview(base64);
    } catch (e) {
      showToast("图片读取失败");
    }
  }

  async function addItem() {
    if (!newItemName.trim()) return;
    try {
      await apiCall("/api/items", {
        method: "POST",
        role,
        body: { name: newItemName.trim(), image: newItemImageData || null },
      });
      setNewItemName("");
      setNewItemImagePreview("");
      setNewItemImageData("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("商品已添加");
      refreshData();
    } catch (e) {
      showToast(e.message || "添加失败");
    }
  }

  async function removeItem(id) {
    try {
      await apiCall(`/api/items/${id}`, { method: "DELETE", role });
      showToast("商品已删除");
      refreshData();
    } catch (e) {
      showToast(e.message || "删除失败");
    }
  }

  function updateCart(itemId, qty) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = qty;
      }
      return next;
    });
  }

  async function placeOrder() {
    const cartEntries = Object.entries(cart);
    if (cartEntries.length === 0) return;
    try {
      await apiCall("/api/orders", {
        method: "POST",
        role,
        body: { cartItems: cartEntries.map(([itemId, qty]) => ({ itemId, qty })) },
      });
      setCart({});
      showToast("订单已提交！");
      refreshData();
    } catch (e) {
      showToast(e.message || "提交失败");
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      await apiCall(`/api/orders/${orderId}`, { method: "PATCH", role, body: { status } });
      refreshData();
    } catch (e) {
      showToast(e.message || "更新失败");
    }
  }

  async function deleteOrder(orderId) {
    try {
      await apiCall(`/api/orders/${orderId}`, { method: "DELETE", role });
      refreshData();
    } catch (e) {
      showToast(e.message || "删除失败");
    }
  }

  async function handleChangePassword() {
    setPwError("");
    try {
      await apiCall("/api/change-password", {
        method: "POST",
        role,
        body: { currentPassword: pwCurrent, newPassword: pwNew },
      });
      if (pwNew !== pwConfirm) {
        setPwError("两次输入的新密码不一致");
        return;
      }
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      showToast("密码已更新");
    } catch (e) {
      setPwError(e.message || "修改失败");
    }
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    );
  }

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  // ---------- LOGIN SCREEN ----------
  if (!role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-stone-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-stone-900">订购中心</h1>
            <p className="text-stone-500 text-sm mt-1">请登录以继续</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <input
              type="password"
              value={loginInput}
              onChange={(e) => {
                setLoginInput(e.target.value);
                setLoginError("");
              }}
              placeholder="密码"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-3 text-stone-900"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin("client");
              }}
            />
            {loginError && <p className="text-red-500 text-xs mb-3">{loginError}</p>}

            <div className="grid grid-cols-2 gap-3 mt-2">
              <button
                onClick={() => handleLogin("client")}
                disabled={loading}
                className="py-3 rounded-xl bg-stone-900 text-white font-medium text-sm hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                我是客户
              </button>
              <button
                onClick={() => handleLogin("admin")}
                disabled={loading}
                className="py-3 rounded-xl bg-stone-100 text-stone-900 font-medium text-sm hover:bg-stone-200 transition-colors border border-stone-200 disabled:opacity-50"
              >
                我是管理员
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-stone-400 mt-4">
            后端地址：{API_BASE.includes("YOUR-BACKEND-URL") ? (
              <span className="text-amber-600">尚未配置，请先部署后端</span>
            ) : (
              API_BASE
            )}
          </p>
        </div>
      </div>
    );
  }

  // ---------- CLIENT VIEW ----------
  if (role === "client") {
    return (
      <div className="min-h-screen bg-stone-50">
        <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-stone-900">菜单</h1>
            <p className="text-xs text-stone-500">点击商品添加到订单</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAdminTab(adminTab === "pw" ? "" : "pw")}
              className="text-stone-400 hover:text-stone-700 transition-colors"
              title="修改密码"
            >
              <KeyRound className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="text-stone-400 hover:text-stone-700 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {connError && (
          <div className="bg-red-50 text-red-600 text-xs px-5 py-2 text-center">{connError}</div>
        )}

        {adminTab === "pw" && (
          <div className="p-5 pb-0">
            <div className="bg-white rounded-2xl border border-stone-200 p-4 max-w-md">
              <p className="text-sm font-medium text-stone-900 mb-3">修改密码</p>
              <input
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                placeholder="当前密码"
                className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-2 text-sm text-stone-900"
              />
              <input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="新密码"
                className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-2 text-sm text-stone-900"
              />
              <input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="确认新密码"
                className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-3 text-sm text-stone-900"
              />
              {pwError && <p className="text-red-500 text-xs mb-3">{pwError}</p>}
              <button
                onClick={handleChangePassword}
                className="w-full py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors"
              >
                保存新密码
              </button>
            </div>
          </div>
        )}

        <div className="p-5 pb-28">
          {items.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">暂无可订购商品。</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {items.map((item) => {
                const qty = cart[item.id] || 0;
                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="aspect-square bg-stone-100">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-stone-900 truncate mb-2">{item.name}</p>
                      {qty === 0 ? (
                        <button
                          onClick={() => updateCart(item.id, 1)}
                          className="w-full py-2 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> 添加
                        </button>
                      ) : (
                        <div className="flex items-center justify-between bg-stone-100 rounded-lg px-1 py-1">
                          <button
                            onClick={() => updateCart(item.id, qty - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-200 text-stone-700 font-medium"
                          >
                            −
                          </button>
                          <span className="text-sm font-medium text-stone-900">{qty}</span>
                          <button
                            onClick={() => updateCart(item.id, qty + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-200 text-stone-700 font-medium"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cartCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent">
            <button
              onClick={placeOrder}
              className="w-full max-w-md mx-auto flex items-center justify-center gap-2 py-4 rounded-2xl bg-stone-900 text-white font-medium shadow-lg hover:bg-stone-800 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              提交订单（{cartCount} 件商品）
            </button>
          </div>
        )}

        {toast && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-20">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ---------- ADMIN VIEW ----------
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const otherOrders = orders.filter((o) => o.status !== "pending");

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
        <h1 className="font-semibold text-stone-900">管理后台</h1>
        <button onClick={handleLogout} className="text-stone-400 hover:text-stone-700 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {connError && (
        <div className="bg-red-50 text-red-600 text-xs px-5 py-2 text-center">{connError}</div>
      )}

      <div className="flex border-b border-stone-200 bg-white px-5 overflow-x-auto">
        <button
          onClick={() => setAdminTab("orders")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            adminTab === "orders" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400"
          }`}
        >
          <ClipboardList className="w-4 h-4" /> 订单
          {pendingOrders.length > 0 && (
            <span className="bg-stone-900 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>
          )}
        </button>
        <button
          onClick={() => setAdminTab("items")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            adminTab === "items" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400"
          }`}
        >
          <Package className="w-4 h-4" /> 商品管理
        </button>
        <button
          onClick={() => setAdminTab("settings")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            adminTab === "settings" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400"
          }`}
        >
          <KeyRound className="w-4 h-4" /> 密码设置
        </button>
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        {adminTab === "orders" && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="text-center py-20 text-stone-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">暂无订单。</p>
              </div>
            ) : (
              [...pendingOrders, ...otherOrders].map((order) => (
                <div key={order.id} className="bg-white rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          order.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : order.status === "fulfilled"
                            ? "bg-green-100 text-green-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {order.status === "pending" && <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />}
                        {order.status === "fulfilled" && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
                        {order.status === "pending" ? "待处理" : "已完成"}
                      </span>
                      <span className="text-xs text-stone-400">{formatDate(order.createdAt)}</span>
                    </div>
                    <button onClick={() => deleteOrder(order.id)} className="text-stone-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <ul className="space-y-1 mb-3">
                    {order.items.map((it, idx) => (
                      <li key={idx} className="text-sm text-stone-700 flex justify-between">
                        <span>{it.name}</span>
                        <span className="text-stone-400">×{it.qty}</span>
                      </li>
                    ))}
                  </ul>

                  {order.status === "pending" && (
                    <button
                      onClick={() => updateOrderStatus(order.id, "fulfilled")}
                      className="w-full py-2 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> 标记为已完成
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {adminTab === "items" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <p className="text-sm font-medium text-stone-900 mb-3">添加新商品</p>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="商品名称"
                className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-3 text-sm text-stone-900"
              />

              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageSelect}
                className="hidden"
                id="image-upload-input"
              />

              {newItemImagePreview ? (
                <div className="relative mb-3 w-24 h-24">
                  <img src={newItemImagePreview} alt="预览" className="w-24 h-24 object-cover rounded-lg border border-stone-200" />
                  <button
                    onClick={() => {
                      setNewItemImagePreview("");
                      setNewItemImageData("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow flex items-center justify-center text-stone-500 hover:text-red-500 border border-stone-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="image-upload-input"
                  className="mb-3 w-24 h-24 rounded-lg border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 hover:border-stone-400 hover:text-stone-500 cursor-pointer transition-colors gap-1"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px]">上传图片</span>
                </label>
              )}

              <button
                onClick={addItem}
                disabled={!newItemName.trim()}
                className="w-full py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> 添加商品
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden relative">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-stone-500 hover:text-red-500 shadow-sm z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="aspect-square bg-stone-100">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-300">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-stone-900 truncate">{item.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === "settings" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 max-w-md">
            <p className="text-sm font-medium text-stone-900 mb-3">修改管理员密码</p>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              placeholder="当前密码"
              className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-2 text-sm text-stone-900"
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="新密码"
              className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-2 text-sm text-stone-900"
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="确认新密码"
              className="w-full px-3 py-2.5 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-3 text-sm text-stone-900"
            />
            {pwError && <p className="text-red-500 text-xs mb-3">{pwError}</p>}
            <button
              onClick={handleChangePassword}
              className="w-full py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors"
            >
              保存新密码
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-20">
          {toast}
        </div>
      )}
    </div>
  );
}