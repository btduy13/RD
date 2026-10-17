// Hai máy sửa số dư đầu kỳ của hai đối tác khác nhau cùng lúc: chi tiết đối tác ghép theo từng mã,
// tổng TK 131/331 phải được cộng lại sau pull để Sổ cái khớp công nợ chi tiết trên mọi máy.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { FakeServer, makeStation } = require("./helpers/fake-versioned-cloud");

const engineSrc = fs.readFileSync(path.join(__dirname, "..", "js", "core", "accounting-engine.js"), "utf8");

function editOpening(S, id, debit, credit) {
  const ts = Date.now();
  S.state.partnerOpeningBalances[id] = { debit, credit };
  S.state.partnerOpeningBalanceTs[id] = ts;
  S.run("applyPartnerOpeningTotals(state)");
  S.state._lastModified = ts;
}

async function main() {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  [A, B].forEach(S => S.run(engineSrc));
  const t0 = Date.now() - 100000;
  A.state.partners.push(
    { id: "KH1", name: "Khách 1", type: "retail", _updatedAt: t0 },
    { id: "KH2", name: "Khách 2", type: "project", _updatedAt: t0 },
    { id: "NCC1", name: "NCC 1", type: "supplier", _updatedAt: t0 }
  );
  A.state.partnerOpeningBalances = { KH1: { debit: 1000, credit: 0 }, KH2: { debit: 0, credit: 0 }, NCC1: { debit: 0, credit: 300 } };
  A.state.partnerOpeningBalanceTs = { KH1: t0, KH2: t0, NCC1: t0 };
  A.state.initialBalances = { "131": { name: "Phải thu", type: "debit", balance: 1000 }, "331": { name: "Phải trả", type: "credit", balance: 300 } };
  A.state._lastModified = t0;
  await A.push(); await B.pull();
  assert.strictEqual(B.state.initialBalances["131"].balance, 1000, "precondition");

  // Sửa song song, mỗi máy chỉ thấy thay đổi của mình khi tính tổng.
  editOpening(A, "KH1", 1500, 0);
  await new Promise(r => setTimeout(r, 5));
  editOpening(B, "KH2", 200, 0);
  assert.strictEqual(A.state.initialBalances["131"].balance, 1500);
  assert.strictEqual(B.state.initialBalances["131"].balance, 1200);

  await A.push();
  await B.pull(); await B.push();
  await A.pull();

  for (const S of [A, B]) {
    assert.strictEqual(S.state.partnerOpeningBalances.KH1.debit, 1500, S.name + " KH1 opening");
    assert.strictEqual(S.state.partnerOpeningBalances.KH2.debit, 200, S.name + " KH2 opening");
    assert.deepStrictEqual(
      { type: S.state.initialBalances["131"].type, balance: S.state.initialBalances["131"].balance },
      { type: "debit", balance: 1700 }, S.name + " 131 opening = sum of customer openings");
    assert.strictEqual(S.state.initialBalances["131"].name, "Phải thu", S.name + " account name kept");
    assert.strictEqual(S.state.initialBalances["331"].balance, 300, S.name + " 331 unchanged");
  }

  // Pull không đổi dữ liệu đối tác thì không đụng tới tổng (giữ số khai báo tay).
  A.state.initialBalances["131"] = { ...A.state.initialBalances["131"], balance: 1234 };
  await A.pull();
  assert.strictEqual(A.state.initialBalances["131"].balance, 1234, "no partner-opening change -> manual total untouched");

  console.log("opening total sync tests passed");
}

main().catch(err => { console.error(err); process.exit(1); });
