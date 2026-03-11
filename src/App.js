import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ===================== 核心配置（替换成你的合约地址）=====================
const CONFIG = {
  // BSC链ID（主网56，测试网97）
  chainId: 56,
  // FL代币合约地址
  FL_ADDRESS: "0xYourFLTokenAddress",
  // SDT代币合约地址
  SDT_ADDRESS: "0xYourSDTTokenAddress",
  // FL-SDT交易对合约地址（之前部署的FLSDTPair）
  PAIR_ADDRESS: "0xYourFLSDTPairAddress",
  // 代币小数位（默认18，和你的合约一致）
  DECIMALS: 18
};

// ===================== ABIs（核心交互接口，不用改）=====================
// ERC20通用ABI（授权/转账）
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)"
];

// FL-SDT交易对ABI（添加/移除流动性）
const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function reserve0() external view returns (uint256)",
  "function reserve1() external view returns (uint256)",
  "function mint(address to) external returns (uint256)",
  "function burn(address to) external returns (uint256, uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

function App() {
  // ===================== 状态管理 =====================
  // 钱包状态
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  // 池子状态
  const [reserveFL, setReserveFL] = useState(0); // 池子FL储备
  const [reserveSDT, setReserveSDT] = useState(0); // 池子SDT储备
  // 添加流动性输入
  const [inputFL, setInputFL] = useState(""); // 要添加的FL数量
  const [inputSDT, setInputSDT] = useState(""); // 要添加的SDT数量
  // 授权状态
  const [flApproved, setFlApproved] = useState(false);
  const [sdtApproved, setSdtApproved] = useState(false);
  const [lpApproved, setLpApproved] = useState(false);

  // ===================== 初始化：连接钱包 + 获取池子数据 =====================
  useEffect(() => {
    // 连接MetaMask钱包
    const connectWallet = async () => {
      if (window.ethereum) {
        try {
          // 切换到BSC链
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CONFIG.chainId.toString(16)}` }]
          });
          // 获取provider/signer/账户
          const _provider = new ethers.providers.Web3Provider(window.ethereum);
          const _signer = _provider.getSigner();
          const accounts = await _provider.listAccounts();
          
          setProvider(_provider);
          setSigner(_signer);
          setAccount(accounts[0] || "");
          // 获取池子储备数据
          await getPoolReserves(_provider);
          // 检查授权状态
          await checkApprovals(accounts[0], _signer);
        } catch (err) {
          toast.error(`钱包连接失败：${err.message}`);
        }
      } else {
        toast.error("请安装MetaMask钱包！");
      }
    };

    connectWallet();
    // 监听钱包账户变化
    window.ethereum?.on("accountsChanged", (accounts) => setAccount(accounts[0] || ""));
  }, []);

  // ===================== 核心函数 =====================
  // 1. 获取池子FL/SDT储备
  const getPoolReserves = async (_provider) => {
    try {
      const pairContract = new ethers.Contract(CONFIG.PAIR_ADDRESS, PAIR_ABI, _provider);
      const _reserveFL = ethers.utils.formatUnits(await pairContract.reserve0(), CONFIG.DECIMALS);
      const _reserveSDT = ethers.utils.formatUnits(await pairContract.reserve1(), CONFIG.DECIMALS);
      setReserveFL(Number(_reserveFL));
      setReserveSDT(Number(_reserveSDT));
    } catch (err) {
      toast.error(`获取池子数据失败：${err.message}`);
    }
  };

  // 2. 检查授权状态（FL/SDT/LP是否授权给交易对）
  const checkApprovals = async (userAccount, _signer) => {
    if (!userAccount || !_signer) return;
    try {
      // FL授权状态
      const flContract = new ethers.Contract(CONFIG.FL_ADDRESS, ERC20_ABI, _signer);
      const flAllowance = await flContract.allowance(userAccount, CONFIG.PAIR_ADDRESS);
      setFlApproved(flAllowance.gt(0));

      // SDT授权状态
      const sdtContract = new ethers.Contract(CONFIG.SDT_ADDRESS, ERC20_ABI, _signer);
      const sdtAllowance = await sdtContract.allowance(userAccount, CONFIG.PAIR_ADDRESS);
      setSdtApproved(sdtAllowance.gt(0));

      // LP授权状态（移除流动性用）
      const lpContract = new ethers.Contract(CONFIG.PAIR_ADDRESS, ERC20_ABI, _signer);
      const lpAllowance = await lpContract.allowance(userAccount, CONFIG.PAIR_ADDRESS);
      setLpApproved(lpAllowance.gt(0));
    } catch (err) {
      toast.error(`检查授权失败：${err.message}`);
    }
  };

  // 3. 授权代币（FL/SDT/LP）
  const approveToken = async (tokenType) => {
    if (!signer) {
      toast.error("请先连接钱包！");
      return;
    }
    try {
      let contract, tokenAddress;
      // 选择要授权的代币
      if (tokenType === "FL") {
        tokenAddress = CONFIG.FL_ADDRESS;
        contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      } else if (tokenType === "SDT") {
        tokenAddress = CONFIG.SDT_ADDRESS;
        contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      } else if (tokenType === "LP") {
        tokenAddress = CONFIG.PAIR_ADDRESS;
        contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      }

      // 授权无限额度（方便多次操作）
      const approveTx = await contract.approve(
        CONFIG.PAIR_ADDRESS,
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
      toast.success(`${tokenType}授权成功！`);
      
      // 更新授权状态
      if (tokenType === "FL") setFlApproved(true);
      if (tokenType === "SDT") setSdtApproved(true);
      if (tokenType === "LP") setLpApproved(true);
    } catch (err) {
      toast.error(`${tokenType}授权失败：${err.message}`);
    }
  };

  // 4. 添加流动性
  const addLiquidity = async () => {
    if (!signer || !inputFL || !inputSDT) {
      toast.error("请输入FL/SDT数量并连接钱包！");
      return;
    }
    if (!flApproved || !sdtApproved) {
      toast.error("请先授权FL和SDT！");
      return;
    }

    try {
      // 转换数量为合约单位（乘以10^18）
      const flAmount = ethers.utils.parseUnits(inputFL, CONFIG.DECIMALS);
      const sdtAmount = ethers.utils.parseUnits(inputSDT, CONFIG.DECIMALS);

      // 1. 转FL到交易对合约
      const flContract = new ethers.Contract(CONFIG.FL_ADDRESS, ERC20_ABI, signer);
      await flContract.transfer(CONFIG.PAIR_ADDRESS, flAmount);
      
      // 2. 转SDT到交易对合约
      const sdtContract = new ethers.Contract(CONFIG.SDT_ADDRESS, ERC20_ABI, signer);
      await sdtContract.transfer(CONFIG.PAIR_ADDRESS, sdtAmount);

      // 3. 调用mint获取LP代币
      const pairContract = new ethers.Contract(CONFIG.PAIR_ADDRESS, PAIR_ABI, signer);
      const mintTx = await pairContract.mint(account);
      await mintTx.wait();

      toast.success("添加流动性成功！已发放LP代币到你的钱包");
      // 重置输入框
      setInputFL("");
      setInputSDT("");
      // 刷新池子数据
      await getPoolReserves(provider);
    } catch (err) {
      toast.error(`添加流动性失败：${err.message}`);
    }
  };

  // 5. 移除流动性
  const removeLiquidity = async () => {
    if (!signer || !lpApproved) {
      toast.error("请先授权LP代币并连接钱包！");
      return;
    }
    try {
      // 获取用户LP代币余额
      const lpContract = new ethers.Contract(CONFIG.PAIR_ADDRESS, ERC20_ABI, signer);
      const lpBalance = await lpContract.balanceOf(account);
      if (lpBalance.eq(0)) {
        toast.error("你的钱包没有LP代币！");
        return;
      }

      // 1. 转LP代币到交易对合约
      await lpContract.transfer(CONFIG.PAIR_ADDRESS, lpBalance);
      
      // 2. 调用burn销毁LP，取回FL+SDT
      const pairContract = new ethers.Contract(CONFIG.PAIR_ADDRESS, PAIR_ABI, signer);
      const burnTx = await pairContract.burn(account);
      await burnTx.wait();

      toast.success("移除流动性成功！已返还FL+SDT到你的钱包");
      // 刷新池子数据
      await getPoolReserves(provider);
    } catch (err) {
      toast.error(`移除流动性失败：${err.message}`);
    }
  };

  // ===================== 页面渲染 =====================
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1>FL-SDT 流动性管理</h1>
      {/* 钱包信息 */}
      <div style={{ margin: 20 ottom, padding: 10, border: "1px solid #eee" }}>
        <p>当前账户：{account || "未连接钱包"}</p>
        <p>池子储备：{reserveFL.toFixed(4)} FL / {reserveSDT.toFixed(4)} SDT</p>
        <p>当前比例：1 FL = {(reserveSDT / reserveFL).toFixed(4)} SDT</p>
      </div>

      {/* 添加流动性 */}
      <div style={{ margin: 20 ottom, padding: 10, border: "1px solid #eee" }}>
        <h2>添加流动性</h2>
        <div style={{ margin: 10 ottom }}>
          <label>FL数量：</label>
          <input
            type="number"
            value={inputFL}
            onChange={(e) => setInputFL(e.target.value)}
            placeholder="输入要添加的FL数量"
            style={{ width: 300, padding: 5, marginLeft: 10 }}
          />
          {!flApproved && (
            <button onClick={() => approveToken("FL")} style={{ marginLeft: 10, padding: 5 }}>
              授权FL
            </button>
          )}
        </div>
        <div style={{ margin: 10 ottom }}>
          <label>SDT数量：</label>
          <input
            type="number"
            value={inputSDT}
            onChange={(e) => setInputSDT(e.target.value)}
            placeholder="输入要添加的SDT数量（按池子比例）"
            style={{ width: 300, padding: 5, marginLeft: 10 }}
          />
          {!sdtApproved && (
            <button onClick={() => approveToken("SDT")} style={{ marginLeft: 10, padding: 5 }}>
              授权SDT
            </button>
          )}
        </div>
        <button onClick={addLiquidity} style={{ padding: 8, background: "#4CAF50", color: "white", border: "none" }}>
          确认添加流动性
        </button>
      </div>

      {/* 移除流动性 */}
      <div style={{ margin: 20 ottom, padding: 10, border: "1px solid #eee" }}>
        <h2>移除流动性</h2>
        {!lpApproved && (
          <button onClick={() => approveToken("LP")} style={{ marginBottom: 10, padding: 5 }}>
            授权LP代币
          </button>
        )}
        <button onClick={removeLiquidity} style={{ padding: 8, background: "#f44336", color: "white", border: "none" }}>
          移除全部流动性
        </button>
      </div>

      <ToastContainer position="bottom-right" />
    </div>
  );
}

export default App;
