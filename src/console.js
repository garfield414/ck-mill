import { core, sale, sire } from './eth/web3'
import db from './db'

console.log('console loaded!')

// TODO: don't hardcode my kitties...
// bg1 for gen 1 breeding group
const bg0 = [25493, 403350]
const bg1 = [3954, 85736, 113881, 117491, 228842, 418037]
const bg2 = [258963, 279505, 282323, 344576, 345869, 375866, 381126, 382851, 382857, 392928]

const myKitties = () => {
  return [].concat.apply([], [bg0, bg1, bg2])
}

const findBreedingPair = (lok) => {
  const kitties = []
  for (let i=0; i<lok.length; i++) {
    kitties.push(getKitty(lok[i]))
  }

  // bps for Breeding PairS
  var bps = []
  for (let i=0; i<lok.length; i++) {
    for (let j=i+1; j<lok.length; j++) {
      if (core.canBreedWith(lok[i], lok[j]) && kitties[i].isReady && kitties[j].isReady) {
        if (kitties[i].cooldownIndex > kitties[j].cooldownIndex) {
          bps.push([j, i]) // low cooldown first
        } else {
          bps.push([i, j])
        }
      }
    }
  }

  bps.sort((a,b)=>{
    // da for Delta A or cooldown difference in pair a
    let da = Math.abs(kitties[a[0]].cooldownIndex-kitties[a[1]].cooldownIndex)
    let db = Math.abs(kitties[b[0]].cooldownIndex-kitties[b[1]].cooldownIndex)
    // return -1 if a should come before b
    return db-da // sort so greatest differences are in front
  })

  // get list of recommended breedings
  // no recommendations should be mutually exclusive
  const output = []
  while (bps.length) {
    output.push([lok[bps[0][0]], lok[bps[0][1]]])
    bps = bps.filter((pair)=>{
      for (let p=0; p<output.length; p++) {
        if (lok[pair[0]] === output[p][0] || lok[pair[0]] === output[p][1] ||
            lok[pair[1]] === output[p][0] || lok[pair[1]] === output[p][1]) {
          return (false)
        }
      }
      return (true)
    })
  }

  return (output)
}

const breedGroup = (lok) => {
  let ready = []
  for (let i=0; i<lok.length; i++) {
    // Do you own this kitty?
    if (web3.eth.accounts[0] !== core.ownerOf(lok[i])) {
      return(`Error: you don't own kitty ${lok[i]}`)
    }
    if (core.getKitty(lok[i])[1]) {
      ready.push(lok[i])
    }
    // Can this kitty breed with the others in the group?
    for (let j=i+1; j<lok.length; j++) {
      if (!core.canBreedWith(lok[i], lok[j])) {
        return(`Error: kitty ${lok[i]} and kitty ${lok[j]} can't breed`)
      }
    }
  }
  if (ready.length < 2) {
    return (`Error: not enough kitties are ready`)
  }

  const kitties = []
  for (let i=0; i<ready.length; i++) {
    kitties.push(core.getKitty(ready[i]))
  }

  kitties.sort((a,b)=>a[2]-b[2])

  console.log(`Confirm siring kitty ${ready[1]} (gen=${kitties[1][8]},cdi=${kitties[1][2]}) with matron kitty ${ready[0]} (gen=${kitties[0][8]},cdi=${kitties[0][2]})`)

  // (matron, sire)
  const tx = {
    from: web3.eth.accounts[0],
    to: core.address,
    value: core.autoBirthFee(),
    gas: 150000,
    gasPrice: web3.eth.gasPrice * 0.9,
    data: core.breedWithAuto.getData(ready[0], ready[1]),
  }
  console.log(JSON.stringify(tx, null, 2))
  personal.unlockAccount(web3.eth.accounts[0])
  var txhash = web3.eth.sendTransaction(tx)
  personal.lockAccount(web3.eth.accounts[0])
  return web3.eth.getTransaction(txhash)
}


const status = () => {
  if (web3.eth.syncing) {
    return `On block ${web3.eth.syncing.currentBlock} (latest is ${web3.eth.syncing.highestBlock-web3.eth.syncing.currentBlock} blocks ahead)`
  } else {
    return `On block ${web3.eth.blockNumber} (we're up to date!)`
  }
}

const sellKitty = (id, milli) => {
  personal.unlockAccount(web3.eth.accounts[0])
  core.createSaleAuction.sendTransaction(
    id,
    web3.toWei(milli,'milli'),
    0,
    129600,
    {
      from: web3.eth.accounts[0],
      to: core.address,
      value: 0,
      gas: 250000,
    },
    (error, txhash) => {
      if (error) {
        console.error(JSON.stringify(error, null, 2))
      } else {
        console.log(JSON.stringify(web3.eth.getTransaction(txhash), null, 2))
      }
    }
  )
  personal.lockAccount(web3.eth.accounts[0]) // don't accidently sell twice!
  return status()
}

// Helpful function for getting all kitty data
const getKitty = (id) => {

  let out = core.getKitty.call(id)

  const kitty = {
    id: id,
    isGestating: out[0],
    isReady: out[1],
    cooldownIndex: out[2],
    nextActionAt: out[3],
    siringWithId: out[4],
    birthTime: out[5],
    matronId: out[6],
    sireId: out[7],
    generation: out[8],
    genes: out[9],
    owner: core.ownerOf.call(id)
  }

  out = sale.getAuction.call(id)
  if (out[0] !== '0x') {
    kitty.forSale = true
    kitty.forSire = false
    kitty.startPrice = out[1]
    kitty.endPrice = out[2]
    kitty.duration = out[3]
    kitty.startedAt = out[4]
    kitty.currentPrice = sale.getCurrentPrice.call(id)
    return (kitty)
  }

  out = sire.getAuction.call(id)
  if (out[0] !== '0x') {
    kitty.forSale = false
    kitty.forSire = true
    kitty.startPrice = out[1]
    kitty.endPrice = out[2]
    kitty.duration = out[3]
    kitty.startedAt = out[4]
    kitty.currentPrice = ck.sire.getCurrentPrice.call(id)
    return (kitty)
  }

  kitty.forSale = false
  kitty.forSire = false
  kitty.startPrice = null
  kitty.endPrice = null
  kitty.duration = null
  kitty.startedAt = null
  kitty.currentPrice = null
  return kitty
}

const ls = () => {
  const mk = myKitties() // mk for My Kitties
  for (let i=0; i<mk.length; i++) {
    let k = getKitty(mk[i]) // k for Kitty
    let msg = `Kitty ${mk[i]} gen=${k.generation} cdi=${k.cooldownIndex} lineage=`
    if (Number(k.matronId) > Number(k.sireId)) {
      msg += `${k.sireId}-${k.matronId} `
    } else {
      msg += `${k.matronId}-${k.sireId} `
    }
    if (k.isPregnant) msg += '[Pregnant] '
    if (k.isReady) msg += '[Ready] '
    console.log(msg)
  }
}

const ck = { db, core, sale, sire, getKitty, sellKitty, status, breedGroup, myKitties, findBreedingPair, ls, bg0, bg1, bg2 }

export default ck
