#多个服务器，servers中 每个服务器用空格隔开，ip与目录地址用分号隔开
# servers=("ip:dir" "ip:dir")
# office="10.15.9.114:/web-tools/i18n-xlsx-js"
# servers=($office)

# for server in  ${servers[@]};
# do
#   ip=${server%%:*}
#   dir=${server#*:}
#   echo $ip $dir
#   echo 服务器：$ip开始更新代码
#   echo 开始删除旧文件...
#   ssh root@$ip "cd $dir && rm -rf *"
#   echo '远端删除旧文件完成，开始传送文件...'
#   scp  -r src/* root@$ip:$dir
#   echo '文件传送完成'
#   echo 服务器：$ip 代码更新成功
# done
# echo 成功！

 

echo '1、代码上传'

message="cd /root/webroot/i18n-js-excel && rm -rf *"

echo '2、执行远程命令：' "$message"
ssh root@web-play.cn "$message"

echo '3、传送'
scp -r ./* root@web-play.cn:/root/webroot/i18n-js-excel

echo '代码发布完成'


