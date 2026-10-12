// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract TransactionVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 758955540431840534078500067708670853860193975067564355138398252623154730423;
    uint256 constant alphay  = 6473407743690399711086402458024837717367862139666278276527768132169991140208;
    uint256 constant betax1  = 15504920613231409703248444587038294508991987128816518962773411291723927576146;
    uint256 constant betax2  = 19996948402399162761546325005313250799455788611469612653010818397506686308678;
    uint256 constant betay1  = 21573869768593091719563007743376308018527014299765389434232936048216560896098;
    uint256 constant betay2  = 10705126915643563775782505866911265318287213432512031127415747368036211044423;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 20223005743148090069740508519509413864462718802607495368963358889161611152050;
    uint256 constant deltax2 = 18115294878956767353250126223323279729838415946589036867618768922948151900952;
    uint256 constant deltay1 = 575458661439626249686097968750671577952743344539727186609021670822765530885;
    uint256 constant deltay2 = 10213866236936047965365815864838100165555616155222902610727626618850075756927;

    
    uint256 constant IC0x = 12317738547513307007116137985976291958065007126245223989442442450472823065226;
    uint256 constant IC0y = 3159984652230936445342604496446788585247604227707479743753383862187773791439;
    
    uint256 constant IC1x = 9902837043245742057761107886873735159363194705568750576725344619767503598259;
    uint256 constant IC1y = 19313492132863912406800888295812680325764369890765042430549408834975517107965;
    
    uint256 constant IC2x = 19929029549220174743217104933367459546693109024690062622757112315031894588951;
    uint256 constant IC2y = 19378720690743727494172988496748697507127239725661926269591255543731292776600;
    
    uint256 constant IC3x = 18520898255588528425192671715707286559451854769041475898516344204340941807318;
    uint256 constant IC3y = 7729757723789148498499238102584290304218693971275725902333929610555381220942;
    
    uint256 constant IC4x = 19202525708816180208774847298922986702459135609542889705936826315044854214204;
    uint256 constant IC4y = 9867366627044950737869729087715042706334226273305473639637199602684360223450;
    
    uint256 constant IC5x = 6560860947095701610525015483503969909374005823416600443023372911097207892262;
    uint256 constant IC5y = 12376694177634850089660544946884172593121822173156418916591242208327060974935;
    
    uint256 constant IC6x = 4255565243342946684389501581912666994758217627517479099928084164925375290026;
    uint256 constant IC6y = 20788390530985066917818180203025278297244031213869250447882985486525115631613;
    
    uint256 constant IC7x = 6256007620026056065407229565268992978380917889007412097242329886851662904945;
    uint256 constant IC7y = 331722628479427349853971877400735736617718270171300141696032319533332250767;
    
    uint256 constant IC8x = 7300022822522888240860844554560317611725185754787293888262878719336170216765;
    uint256 constant IC8y = 21104526422368118673692254785965918795314514096289483878727676070883411245750;
    
    uint256 constant IC9x = 14608094340297603707796627169754656085893632578174647856651040628119952983968;
    uint256 constant IC9y = 2128626665562535702273651070157694396748424828727558769719639217664249481685;
    
    uint256 constant IC10x = 12895219879201192766374640163834013753591040508189947109860380186113860670304;
    uint256 constant IC10y = 16125216493852686612710467734750844707639497045529989730768826523040244523108;
    
    uint256 constant IC11x = 12210560227516331779729066914846473920736864314506607023547465212295747822124;
    uint256 constant IC11y = 11610934594046416194474132812275201924896817647191081713400970883225945857526;
    
    uint256 constant IC12x = 1666372010423679262013145316595990647908034510621292479696922440911824198453;
    uint256 constant IC12y = 2611743632762804483172411803757055067465600178281872732055642666686229911868;
    
    uint256 constant IC13x = 13966937683059187056560721074505834076646152310629059393574526460538686878780;
    uint256 constant IC13y = 10698617857689997851889888295859471471886428055565191175235612980648109674185;
    
    uint256 constant IC14x = 21712584089209359810195759277598679830843093455373872655129750481017173332699;
    uint256 constant IC14y = 14545192153123579528481267310990859401089562309991482602890470780472052767926;
    
    uint256 constant IC15x = 16817396583961128294059003557955143805018449622037922553036368862609584568368;
    uint256 constant IC15y = 7129999300190147457355998212207424921906039389986950787741769963018791023926;
    
    uint256 constant IC16x = 10464051722671552415344989103157036339739238097096440036004627441894705781711;
    uint256 constant IC16y = 14972687586979143547405642949823175851358855209001078129372463577300637118643;
    
    uint256 constant IC17x = 20892646135918793933337522933678873799751199559432096338748244561446955836;
    uint256 constant IC17y = 1787771628879253801155472986276904809337494423295583799724312533466304219887;
    
    uint256 constant IC18x = 13970515086962525847976650452162069992210475025703795174371686500525746649568;
    uint256 constant IC18y = 19976736713439941060765239642877543611924572338047700166645998175438579303116;
    
    uint256 constant IC19x = 14483327926477560958095018550886311377353679185154713439558076313682552050195;
    uint256 constant IC19y = 6283653370930137848288401715989807147273252563998213417930576719733933938225;
    
    uint256 constant IC20x = 4436085713713498898825808441312500298612523758586091338343269704749424783419;
    uint256 constant IC20y = 12691421951831334130285163627523863344447626460008611252966351088707674461728;
    
    uint256 constant IC21x = 19622057430603208211160815610277230474128114157059405154392714035588927296892;
    uint256 constant IC21y = 3096873194373205136577561007089373939428928028355954752158043448648520344820;
    
    uint256 constant IC22x = 17783804567451970562115975329690377243577709639711981366074702072413322207137;
    uint256 constant IC22y = 17393563653043717544093050961688365740953404608073375542576731394155266539150;
    
    uint256 constant IC23x = 21262824547470153144843633105816989431741502603150946689491600131429935904315;
    uint256 constant IC23y = 13218478217541258158150752913325056004747752160279182144478142035163168260383;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
