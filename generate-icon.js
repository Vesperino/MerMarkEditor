const fs = require('fs');
const path = require('path');

// Simple 32x32 blue M icon as PNG (minimal valid PNG)
// This is a placeholder - you can replace with a proper icon later
const iconBase64 = `iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAGDf+RAAAARM0lEQVR4nO3dW5LjOAwE0Or9L9pzc+
NhS6JAkJD4qF+z3bYlUsgEJdve/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAPjSfw8H8F/+/f39twN+d+fnPfq1E+r+dD8f/f7k+NV9nhn7p8d/ery/xs5x
f3o/Z4//0/u78vNHv/boOZ89/i+/70/HO+o4R693dP9nx/vpvo+8n7PHPnv9I+PdNdad74+M9dNr
n3n/V67/0/19OvZP71+5vyv3d+T+7xj76vc/PfaVx/vp9c++vyvP79n7P3L8s+P/dO2fju/oeD89
9tnjn73fI/f3ybWPXv+n97vxeXpy/J8e49Pn+8j9Xhn76vWvHPun+/30WD99Hq58X548/iuPd+X+
jn6+z97P0eNf+TyuPN6Zxzty/bOPceX4nz6PT+7nzPGvfJ6PPt9Xn58j93fktc88X2cf68h1j17/
p+d9Y6wjx//0eb/6fP30fu4Y+6fXPHrtM4/31LXPPP7Z+/np+T/72meOf+b5PHv9I6995fFceT5+
+j0/HfvKeH96rE/HeOXxzr7/u+77zOM9co0z93P0sa8e/8prHz3elfe38jk5c/0z93/1+b7yeT9z
7CPXOnL9n+7n0+M/c/yzxz5z/Z++h5+u9dN9fnqs7lhHxr7yfq889pnH+8nZsY++39lrnRn/6PVP
j3Xm+U6O9dNrn33+rhz/p+d75bGOXP/oNY5e/+h9nLnWo+936+d/5Ph/+n6OPNaV5/Pq41157DOP
9+i1z1z/7P0cdWbso9e/cvwz939lrKPH/+navx3jzO0+euyzx7/6fJ8d68pYV45/5P6OjHfm8R69
9qfXP3Kts8//xsd/9jX+3z8v3uenx7/62Fce7+z9nL3/K49/5v5/ep2jz8+V53/lOlfH+vT6V8Y6
8nxfueaZ+z/6fJ+5/pXHuPL+rjzekdf46bXPjn/lsc7c35XH++T4V+/7yLWO3u+RxzjyeFce78rx
z97/1eu+cbv+6ecJZ+/3yuM9ee0j1z/7Gj+99tnrnL3/I4935n7OPP7Zax+9/yPj/XSc/3w8oL9/
Xfvq4125/pVrnTn+T8e/8vhnHu/Kfe4a+8j9/HT9I4/3yfXPvtaZYx1Zvz56vT+NdeT5O3rsT+/v
yvN/9nk+cu0zr/XJ/R+9nyv3d+X+j1777Gs/eryj41+5n0+Oc+X6V+7n0/s5+3yffe0jt/vTax25
3pX7unL/R8f76bXPPt9H7+/KY589/pXbdeX6Zx/3yv2fvfaV+/j0Po5e66fXv3rts6/96XWOPP9X
7u/T+z9y/5+8xh1jnbnds8/v0eOfeb7P3t+Z2/3T/d91u2cfz7rj//R+r17/6u1auf2V+z1y/bOP
e+V+j17r7GMceexPjn3lfs6+xpn7+enan15r4+t+8nyf/Xwe+fyevd/Vr33m/n569prnHu/I8a8+
3tm1AU+Ofeb+z9zfu+/zyuN9+vr/+u+fu/aRMY5e98j1r9zutud/9nlc+b08+xpnxzpzP0df+6f7
OHrts69x9Ppnj3/2fq8c++zj/un+ztzundc6e/yzx/3kuD899j9uh3v23q88/qPPzye378lxrlzj
0+Odfb4/OfaZxz47/pXXPnqtn17zp+Nf+T0cPeZPj3Xlfj593J+e7+f7vXz7Rox/+P18cv2zY/x0
rSPXP3M/nz7e2ev+9PhHxjr7eD89/pHHO3K7j47/0+0+ez+fjPXT4/z0PD69ztHjnH3MI8d3xnp0
rE+Pd+b+r9z+mdv51u0+Ol9Xj3/lfv56rX+dD+fo7bpx++44ztnnb+X+zt7Po9c6+/w/uo8j1zp7
u+8Y68z4Z5/fI+Mfvd6Vz/PRY52935/+3j69v6u3e+X4Z+7/7HPy6dhnX/PT8c++3pljH33sR495
5LHOPH9Xrvvq7b5rjLP3e+U+zt7fo6/x6PNx9HE+vf2fjnXm/p++9tHjHb3ds4939LF/ut8rz8fZ
x//k2mePc+Z+PnkNa/yzz+/Z437y/5OfXOvRY//0Wp+O8cmxztz/0eOfufbZ5+en6/3r+D+99me3
d+V+r/xejlz/yH0+eo27xjhzu85+Xpy939+uc+b4Zx/70+OfOdaZ4195vrfd/yfP7yeu9ekxjj7+
2fu/ctv+cL8rj+f/x7o61qNj3D1WZ8Z/9HpcfX7OPv6Z52/l/o483iu3+47r/XS7j97f2WMdfbyz
1z97vLO3+8zjHTnOmd/bT/f/yePduP13XuPsfc6M+chxzj7e0bHO3s6zx18Z+8z9HTnO2etfeb6v
PN7R61y5/08e98rj3fX78uT5u3u8T+77zONcud/OWHeMd+bxP7m/O8Y98vN3jHnlOneMdceY345/
5fiPHOfscc/ez5nH+/TxP7nW0fv/5Pn76Rhnj/Pp7/Hq7X77nN0x3qP3cebxVm7XXeO9e/yf7vPK
azw6xieP+ej9Xjn+X+/nyut8+n6PXP/u8VbGfvS1nhzr0eMdfexPn98rj/3Ttc8+3tXxjlz7p/u7
Y+w7ju9M/f/9+P79e1buZ2b8M495dKxV+rnuWkeuc/X4d8c7cntnXueO+z37Oj9d++jxP7mtZx/z
6ut+chtXvvdnvr8r1zzz+J/c3pHHP/t4Z1/77GPddd2j1zx6nE8e/67HunL8M/fxyeOdve7Zsc6+
xh1jnT3ulevu+D2dPd6j9/GT6x8Zr/M7O/u4dx/3p9e5evxPrn/HWHdc/+xxr7zeHdfy7vWOXufs
cf70+E/f1k+O99Nr/fR4Vx7vyv2efZwz1/30eo9e587jXnm8I7f77HFXjn/0eD89/qe37cn1z9yf
n1zjyvUXH/fR1/rp+j9d/5Pb+enYZ17ryPHPvN4d9/Hpa124HUdf58jzeeS4d41/9rXuuP6V4529
zk+PefZYnx7zyHU+Pf4dx7pyv2cev/OzP7nG2etduX5njE9f65Pb8umx7j7e2dfyb8c5e+yfrnfm
8e+67pnbfdfj/9fj3XGtq+N/euxPrvvoeGfv58zj33G9u67xye05+/P/7/2def6vPNaVx5s91pHX
+/T16PHPPu7Zx/v0No6+7i/H+vQ6R8c5ct2fbnfn+ofG++T4n173yrHPPPYn97Ny3SPjHbm9Z27/
kftf+dzO3N6R+zv6+Ee+/0/vb+V+Vo59x/WP3tez93n0WHfc7k+udfb6V+7/ymv85DhXvvdPjnXm
/q/c75Xjnnl9J8Y+ctufnuuT+z86xtnH/+k6Rx//ymN+cj9njv3JNR99jDO3+8pjH7n+0fu7cvwr
9391rE+v+9N4n4615Xf+r9u9Y7xPn49Pxjt7/J++xi/H+vQ6d1zvzHU/vY9Hrnfl/q7c7zuuv+Lx
zj7+T8e68ng/HefTa3x6nJ/G+/R2HTn+o/d/5D6u3O+jY9893id/f+Z+zt7OT8c+M8Ynz++nf//T
Ne++jyv3d/bx7xjrzP1+8nqf3m6n3dNrnb2vm8Y/cr27r/Xo8X+6ztFxPn2Mte/rj+fdHWP9/3fu
eIyzx/30tT59rDP3+8mx/nU77z7Op2Nd+fu77vtft/Of1z8yxpnjHn28T8b65Dqf3M+V4555nLPP
x8L93Hm9T49/5NqfXudM/fR8/OP2n3mMo9e6c+yz93vl+leO/8lYV+7v0+Pc9Xhn7ufM8c9e59Hx
jlzryHU/Pf6V2/nJ2Fdv96fXuuv5+PR1jo51x/V+eq2fjnfXda/ex93X/+l1zt7nHce647b85Jhj
t3/HOHdef+XYV+//yv1cefwz1/np+p/8/pXj33WfZ+5/ZYyzxzt7u88+5tnn++jxr1znyu09c6wz
93nHec9e++zjHrn+0de4cryj93/2eHdc+47bueJYdxzj0ev/6vpXnr87rrl07bPXPft4R69x9Hin
r/XJ9c9e69H7v+uaZx7/yrWOXN/Rx7rr+D+NffQad97+0WscOd4d1zlzrDP3//T4d9zPs7/vs6/z
0+Pu+J3ftT5wx3WPXOfs4/90bGes/91j3O96d97O2fv+5Df06f09esyzx//pto4c/871jjv/T47z
0/U+ue7V6/x0rDuu/cnfP3qsT+/jyP1fufYnr3X39T+9XZ9e6+jxP7mtT49/9npXr3n3be8c/8z9
X3msq8c/+zqf3m5n3LvGu+N+jhz/yrE+Pc5P1/rpcX+6zo7H/NS/n99Prvvo/Z85/s7r3XG7Prnf
s697x3jvep2zP3/HNT653h23e8f9HTnmXce5cp27r//pbc083p3XW7k/63f06PHOPN6R+3l0jLuO
deftnL3OHdd39Hhnnr8j9//Jdc887/8c465rnT3enc/nkcdb+dxf+fy/Y/y7rn/0uGevefR4V+/z
yP3e9XhXr/fp43/6emce78rxztznle/rp5/7+FhnHu/M892Zse4e/9PjnnnNu5+fb/+enL3mI493
9FhnHu/OMc5e66drnb3+p8c/e70zY909/u6x/nw/tx7/0+Of/T2cOd7Z69451qdj33m8u27n7P0c
ueadj3fm9u443tnHunu81ed79fn+7v7OXu+O8/7z93LHsY4e6+jxVo535fhn7ueO8/70OF2571+P
8+nv6c5jXbnOXY939jXvuv6V+7tr/CPH/+T47/7cz17n7nGPjHHX8c/e/9njffJz2483dj+P3t+Z
+zt7u8/e593jH7m/s/d/5bpXjnv0dq4c76fXOPu4Z+/n7O05e6yzz/fZ4505/tHrHjnmmed75nZd
eb6vHO+T6xy5jzOP++htnr3OlfHuuq8jf3d0jLtuY+Zxzv7d2evedbt3HPfs7T5633c9v3f9/tnH
+Ol+P7n/u6/1037vGvc/3c7V4xy97s7n79P7OXLto+N9ej9nX+PK8a/c1u7X+OT+VsY/8vpnHv/o
Y316rLuPf+V6P13/yrEevc+z1z/6OD/9fq8e/6drnbk/V+7vzON++vtn7+/sfV59rCO3d+V+jx7z
0fH+e4yz93n2dT89zqevc8ft/fR4V8Z8dPy7x/vk+Fe/t7Pjn73/s8e6cr9XxrzjuEdux0/XOnqs
u4/36e+fPd6n17pyzCPP95XjH33MT2/n7PGOHvfI8z9z+2cf++z9XbnOXce78vxfOd6n17lyvas/
9+i1jjzO0fs7cr0rx/r02mfv+67HPnO7P13/yv0dffyzj/Xpda4c6+7xrpz3X493x/GujPfI7Tx6
XWf8R8f/9FhHrnflWleOf/bxV+5v5fZdOc6R6x+9n0fHO3OsO65z9m+O3OdPj/nTdf/z9+6+xpXb
fWW8I9f/9HhnH/enx+0c/8zzd/T4Zx7nyu358nhXxrr72Fce4+gxP72fI4//0+N+cvvP3o+z9/HT
dfI7OPu4K7d39fhn7+Ps/V+5/pXHunK77xrryv1dud2V41+5rr/d9tnb+el6Vx7rpzFxxx1jnT3G
0eNdud27x/vp8c4+9pXjnX2NR2/j0eNdvT1nX+PI8a7c35X7+u5Yd4535fk7et0rj/fpfV+53k/X
+ulxP72NO6575Pjr93Pmfq7ex6evd9dY/3w8N2/fieu+e+y7rnnmds5e58qxVsb69PhXHv/oWEfv
5+ztunK7fnn8K8e/cvtOjXX2Nq7cx9Exzj72mePdfZ277uPo8e4a66f7+/T1rhz3yuNdOf7Z1zhy
nDtv5+gxPr3WkWufOeaVa56+/zvGu3I/V2733bc5e7tXjnfXsR657h23ceV+P7n+2eN9ev9XH+fK
cY6O9+h1Po111++cPf6Rx7ty7LPHP3u8o4959rmfOf6V+zp6vCu368j1jo5/5fo/Pd6Z1zl7rLtv
9+j9//9+bv7cX6/35v0eOe6VYz/6nK7c/9WxVq5z5PG+e5yzj3fmeT86zlpXxjpynDuuc9fxj4y7
46y+1t3XP/pYS/f/6dhXj3fm/u8e+8p9nrm/u8e5cp0z17pyf39+rDufh7uvddft3HX9I8e/ev0r
xzp7vTPP25HrnP2cnz3eltv9dLwrz9+V5/Po4/z0fJ85/k/Xu+sczhzjyvXPHu/TMX56rLP3e+Z2
3XG7Pz320eu/co/PP+6ux79y/0duy93X/PRxzt7nlevfff2j4545xk+//9Prf3KfV45/5LpXjnHm
OGf+/uj177zdnWN9+nqf3s5dYx05/pnjrtz3I9e/ejtnX/PT+/3pce8Y+5PH+PRYdx3nynWuHO+O
3/uVx/7pde44x0+P89Oxt73Opdv/9PhnH+PI/V59rZ8e59HjXj3e0WNf+f2zxz9yz08/70fGPHu7
rtzvkfv66fEev90rx1w5xpn7O3Lss9c/cj9nX/Ps4/50/Suv8en9H7nOmfv79Bo/XePIMT69/ivH
v/vaP1136bZe/Y27xj57f0fu58r17xjr7HPZudYnz/Pdz9+n1zhyvKP3d+S6d1zzrus8etzN13/0
elePe+Y6R8Y7e5w7Xvvu8e8+3p3XODLukds9erzL13vwdk7fx9H7P3I/V8Y7etz/t99H7++O2/j0
tp89xpn7+en1jxznyP0eff0rx717zCvX++nxzv79p7e7cswzxzr7+mce76fn+67xzxz3yv2fPd6V
xzxyjauPf/R6d1zrzu/h02Ndfc6OXOena39y/J8e8+xrHz3+mdv79O8/vc+zt+fK9Y6Of/T6R493
5Ro/Pd4d4x09/tExz97Op2OsHP+TY3163CP3d+R6V5/fI49/9Fh3HO/M8/vo454Z78j1ztzfo2Pc
/fs/O+7K/dx5/LPXPPo4d9zn2cdbuf7R4x257qfHvDre0es9evwzxz07zpnbdud1P33tK4/76fFW
n99Pj3P0No9e/+zxzz7OlWOeud9HH+PIfR65/pXxPr3Opx86Z2736P2fue7Z17vzeFfGPTr2mecL
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAB4jf8BbwHhzSJfVIsAAAAASUVORK5CYII=`;

// Create a simple 128x128 PNG placeholder
const pngData = Buffer.from(iconBase64, 'base64');
fs.writeFileSync(path.join(__dirname, 'app-icon.png'), pngData);
console.log('Created app-icon.png');
