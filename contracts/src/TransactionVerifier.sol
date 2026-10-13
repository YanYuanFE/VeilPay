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
    uint256 constant deltax1 = 10320398561000419398192342282174054960152865563659697414639308550261669044304;
    uint256 constant deltax2 = 11321189700201864519255150976807221809293317427931055249659746221346373301490;
    uint256 constant deltay1 = 19193031196035066537694192616234740064582167030741511518943881830154364511144;
    uint256 constant deltay2 = 13478648030403098246971891097381587486862566575068503303916255224403344339950;

    
    uint256 constant IC0x = 15218603510770037447019294153796196204722925798669086316848806540764631688950;
    uint256 constant IC0y = 2420043372323290496632741467305429896971494558110413087024190310667614929562;
    
    uint256 constant IC1x = 16409740634713941298629237994952931411724499432984960698118190685595936612359;
    uint256 constant IC1y = 7271499132322589231252932897032767484551158080622641902778420085792117834962;
    
    uint256 constant IC2x = 9952411445787719417848049113997338920164046969066586014860347915202583877801;
    uint256 constant IC2y = 8162843925923486034749978517543633331700766720359138709179862105251972284843;
    
    uint256 constant IC3x = 20376528352151216352525500320162492467119787741948926562113847582899397315839;
    uint256 constant IC3y = 21020858916537698217002990427561986423930938769716569847916825748278586042404;
    
    uint256 constant IC4x = 8822751125434671573329056721008961501945571699663258549811859064122251833213;
    uint256 constant IC4y = 6168249881344911305940714652247983949030292751151602060050044202347595015399;
    
    uint256 constant IC5x = 18357256795968374087142617862582532687293870714394066098302540547681566196674;
    uint256 constant IC5y = 13895447061526223099103163588587142349455885887190867314459181448457603654898;
    
    uint256 constant IC6x = 10667843208573601912015846156757311040505569061375230086227981438085784861602;
    uint256 constant IC6y = 16828968228305352670604535550577374181666894181815411353903375173724453692658;
    
    uint256 constant IC7x = 18058570826683267859241994160726988206755413809184408456583745017613995679631;
    uint256 constant IC7y = 8474932266348093708103143846127443964694774833892750266876140000143368694555;
    
    uint256 constant IC8x = 227317573801372611963305606953586371716542924938551781559540234136619668063;
    uint256 constant IC8y = 8051950235040019860015532854043930183751304344503559819997520415628835291131;
    
    uint256 constant IC9x = 6211218087363625491311277654544642755375692944305785898722401706363467283489;
    uint256 constant IC9y = 10703580370066381705162651743471134515358864789690572061038244018911236757154;
    
    uint256 constant IC10x = 12312843710454355004117204981710472276982944005988274637895284006558865880419;
    uint256 constant IC10y = 19405068236977636378460581492154462800670519112028941640459571644045450808876;
    
    uint256 constant IC11x = 3475213208940911792668545640447844990437802505765200586860491059299701219481;
    uint256 constant IC11y = 12198542513742884958680622976499610080383050431117138007163395223331479758681;
    
    uint256 constant IC12x = 10917134588698433443113602090023395480536305610584901667254786393648513826898;
    uint256 constant IC12y = 20916758017817003283133247076876166657139534952200653835847947300185225126987;
    
    uint256 constant IC13x = 9938995155066396652096914435235980409564514375963316769116410717345363357141;
    uint256 constant IC13y = 17356590674553688611299196715363468379397682011030416820080837914428244371219;
    
    uint256 constant IC14x = 17657211383733564313374965841413934229161872230286132779158720542841863193075;
    uint256 constant IC14y = 15546447235812443450653919031792557229481747925177808386703531948379596933050;
    
    uint256 constant IC15x = 15326257492419610999884968200371567888514951602543464490759164032214747853154;
    uint256 constant IC15y = 17052829939187660773828098934223381207812808205042838380895297756039688354817;
    
    uint256 constant IC16x = 2305686368769474277634902459452856085343718928076839726187043952039408537502;
    uint256 constant IC16y = 21004324632595739313444688766626138250374661747103593275599052874404553528546;
    
    uint256 constant IC17x = 20439102810017370163123399466676403785557157729365482947148678312211238459884;
    uint256 constant IC17y = 12505140937532963752108833753591282727080239627678509226595088776403272764937;
    
    uint256 constant IC18x = 2977033791977507759593831063611235772075738730376877835134585721272767862454;
    uint256 constant IC18y = 10089480116939827935942269780328497383598962859468207691189981903867114339813;
    
    uint256 constant IC19x = 13173721585409620278252902498032976382322013207999519905885608927119390218769;
    uint256 constant IC19y = 16153109189701993119589857163515671032468348851018521646244464453678033882993;
    
    uint256 constant IC20x = 16943961898066850049844056775775184575346005474829164688478501320454195757179;
    uint256 constant IC20y = 9104008580835852715870593769119432758795197253851048687809700297247213441496;
    
    uint256 constant IC21x = 20364130870703716593168756681539690737435749929095456590261964034951642849970;
    uint256 constant IC21y = 10807847263043004306512195454194954425821408215993204561726745342992774990836;
    
    uint256 constant IC22x = 9391938349030854444693495507210743356847206468738551434929906379761739126639;
    uint256 constant IC22y = 10701526432221113620085569506035982002770276252179040552527610987167545762654;
    
    uint256 constant IC23x = 33100492333420660388204744624139335871987691224980914544014354537743809767;
    uint256 constant IC23y = 15527707309938014004758787206783908647168977363067606433600570888977915465265;
    
    uint256 constant IC24x = 19283394789047691935656109986543265429729143342061904229572489092210276743772;
    uint256 constant IC24y = 13134385472036420810204483947898309867313795129754848355849622789971092436702;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[24] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                

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
            
            checkField(calldataload(add(_pubSignals, 736)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
